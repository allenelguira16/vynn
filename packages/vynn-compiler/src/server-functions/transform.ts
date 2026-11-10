import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { parseSync, visitorKeys } from "oxc-parser";

type AstNode = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

type SourceEdit = {
  start: number;
  end: number;
  content: string;
};

type MarkedFunction = {
  fn: AstNode;
  directive: AstNode;
  parent: AstNode | null;
  ordinal: number;
  id: string;
  exportName: string;
};

export type ServerFunctionTarget = "client" | "server";

export type ServerFunctionMetadata = {
  id: string;
  moduleId: string;
  exportName: string;
};

export type TransformServerFunctionsOptions = {
  /** Absolute project root used to produce stable module-relative IDs. */
  root: string;
  /** Whether to emit a browser RPC reference or a server implementation reference. */
  target: ServerFunctionTarget;
  /** Optional build-tool virtual module used to configure the runtime. */
  runtimeModule?: string;
};

export type TransformServerFunctionsResult = {
  code: string;
  map: null;
  functions: ServerFunctionMetadata[];
};

const CREATE_SERVER_REFERENCE = "__vynnCreateServerReference";
const SCRIPT_EXTENSION_RE = /\.(?:[cm]?[jt]sx?)$/i;

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as AstNode).type === "string"
  );
}

function childrenOf(node: AstNode, visit: (child: AstNode) => void): void {
  const keys = (visitorKeys as Record<string, string[]>)[node.type] ?? [];
  for (const key of keys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) visit(child);
      }
    } else if (isNode(value)) {
      visit(value);
    }
  }
}

function getDirectiveValue(statement: AstNode): string | undefined {
  if (typeof statement.directive === "string") return statement.directive;
  if (statement.type !== "ExpressionStatement") return undefined;

  const expression = statement.expression as AstNode | undefined;
  if (
    expression &&
    (expression.type === "Literal" || expression.type === "StringLiteral") &&
    typeof expression.value === "string"
  ) {
    return expression.value;
  }

  return undefined;
}

function getUseServerDirective(fn: AstNode): AstNode | undefined {
  const body = fn.body as AstNode | undefined;
  if (body?.type !== "BlockStatement") return undefined;

  for (const statement of body.body as AstNode[]) {
    const value = getDirectiveValue(statement);
    if (value === "use server") return statement;
    if (value === undefined) break;
  }

  return undefined;
}

function isFunctionNode(node: AstNode): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function cleanModuleId(id: string): string {
  return id.split("?", 1)[0].replace(/\\/g, "/");
}

function inferParserLanguage(id: string): "js" | "jsx" | "ts" | "tsx" {
  if (/\.tsx$/i.test(id)) return "tsx";
  if (/\.(?:ts|mts|cts)$/i.test(id)) return "ts";
  if (/\.jsx$/i.test(id)) return "jsx";
  return "js";
}

function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function getModuleKey(root: string, moduleId: string): string {
  const absolute = resolve(moduleId);
  const relativeId = relative(root, absolute).replace(/\\/g, "/");
  if (relativeId === ".." || relativeId.startsWith("../") || isAbsolute(relativeId)) {
    throw new Error(
      `[Vynn use server] Server functions must be declared inside the project root. Received: ${moduleId}`,
    );
  }
  return relativeId;
}

function collectMarkedFunctions(
  program: AstNode,
  root: string,
  moduleId: string,
): MarkedFunction[] {
  const found: Array<{ fn: AstNode; directive: AstNode; parent: AstNode | null }> = [];
  const parents = new WeakMap<object, AstNode>();

  const walk = (node: AstNode, parent: AstNode | null): void => {
    if (parent) parents.set(node, parent);
    if (isFunctionNode(node)) {
      const directive = getUseServerDirective(node);
      if (directive) found.push({ fn: node, directive, parent });
    }
    childrenOf(node, (child) => walk(child, node));
  };

  walk(program, null);
  const moduleKey = getModuleKey(root, moduleId);

  return found.map((item, ordinal) => {
    if (item.fn.generator) {
      throw new Error(`[Vynn use server] Generator functions are not supported (${moduleKey}).`);
    }

    const digest = stableDigest(`${moduleKey}#${ordinal}`);
    return {
      ...item,
      ordinal,
      id: `vynn_${digest}`,
      exportName: `__vynn_server_fn_${digest}`,
      parent: parents.get(item.fn) ?? item.parent,
    };
  });
}

function containsNestedMarkedBoundary(marked: MarkedFunction[], program: AstNode): boolean {
  const markedNodes = new Set(marked.map((item) => item.fn));
  const parentMap = new WeakMap<object, AstNode>();

  const walk = (node: AstNode): void => {
    childrenOf(node, (child) => {
      parentMap.set(child, node);
      walk(child);
    });
  };

  walk(program);
  for (const item of marked) {
    let ancestor = parentMap.get(item.fn);
    while (ancestor) {
      if (markedNodes.has(ancestor)) return true;
      ancestor = parentMap.get(ancestor);
    }
  }

  return false;
}

type LexicalScope = {
  parent: LexicalScope | null;
  kind: "module" | "function" | "block";
  bindings: Map<string, LexicalBinding>;
};

type LexicalBinding = {
  name: string;
  scope: LexicalScope;
};

type ParentInfo = {
  parent: AstNode;
  key: string;
};

type ScopeAnalysis = {
  moduleScope: LexicalScope;
  scopeByNode: WeakMap<object, LexicalScope>;
  parentByNode: WeakMap<object, ParentInfo>;
};

type ServerFunctionCapture = {
  expression: string;
  alias: string;
  references: AstNode[];
};

type CaptureAnalysis = {
  captures: ServerFunctionCapture[];
  capturesParameter: string;
  parentByNode: WeakMap<object, ParentInfo>;
};

function createLexicalScope(parent: LexicalScope | null, kind: LexicalScope["kind"]): LexicalScope {
  return { parent, kind, bindings: new Map() };
}

function declarePattern(pattern: AstNode | undefined, scope: LexicalScope): void {
  if (!pattern) return;

  if (pattern.type === "Identifier" && typeof pattern.name === "string") {
    scope.bindings.set(pattern.name, { name: pattern.name, scope });
    return;
  }

  if (pattern.type === "RestElement") {
    declarePattern(pattern.argument as AstNode | undefined, scope);
    return;
  }

  if (pattern.type === "AssignmentPattern") {
    declarePattern(pattern.left as AstNode | undefined, scope);
    return;
  }

  if (pattern.type === "TSParameterProperty") {
    declarePattern(pattern.parameter as AstNode | undefined, scope);
    return;
  }

  if (pattern.type === "ArrayPattern") {
    for (const element of (pattern.elements ?? []) as AstNode[]) {
      declarePattern(element, scope);
    }
    return;
  }

  if (pattern.type === "ObjectPattern") {
    for (const property of (pattern.properties ?? []) as AstNode[]) {
      if (property.type === "RestElement") {
        declarePattern(property.argument as AstNode | undefined, scope);
      } else if (property.type === "Property") {
        declarePattern(property.value as AstNode | undefined, scope);
      }
    }
  }
}

function nearestFunctionScope(scope: LexicalScope): LexicalScope {
  let current: LexicalScope | null = scope;
  while (current && current.kind !== "function" && current.kind !== "module") {
    current = current.parent;
  }
  return current ?? scope;
}

function buildScopeAnalysis(program: AstNode): ScopeAnalysis {
  const moduleScope = createLexicalScope(null, "module");
  const scopeByNode = new WeakMap<object, LexicalScope>();
  const parentByNode = new WeakMap<object, ParentInfo>();

  const visit = (
    node: AstNode,
    parentScope: LexicalScope,
    parent: AstNode | null,
    parentKey: string,
    reuseBlockScope = false,
  ): void => {
    if (parent) parentByNode.set(node, { parent, key: parentKey });

    let scope = parentScope;

    if (isFunctionNode(node)) {
      if (node.type === "FunctionDeclaration") {
        declarePattern(node.id as AstNode | undefined, parentScope);
      }

      scope = createLexicalScope(parentScope, "function");

      if (node.type === "FunctionExpression") {
        declarePattern(node.id as AstNode | undefined, scope);
      }

      for (const param of (node.params ?? []) as AstNode[]) {
        declarePattern(param, scope);
      }
    } else if (
      node.type === "BlockStatement" ||
      node.type === "CatchClause" ||
      node.type === "ForStatement" ||
      node.type === "ForInStatement" ||
      node.type === "ForOfStatement" ||
      node.type === "SwitchStatement" ||
      node.type === "StaticBlock"
    ) {
      if (!reuseBlockScope) {
        scope = createLexicalScope(parentScope, "block");
      }

      if (node.type === "CatchClause") {
        declarePattern(node.param as AstNode | undefined, scope);
      }
    } else if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      if (node.type === "ClassDeclaration") {
        declarePattern(node.id as AstNode | undefined, parentScope);
      }

      scope = createLexicalScope(parentScope, "block");

      if (node.type === "ClassExpression") {
        declarePattern(node.id as AstNode | undefined, scope);
      }
    }

    scopeByNode.set(node, scope);

    if (node.type === "VariableDeclaration") {
      const declarationScope = node.kind === "var" ? nearestFunctionScope(scope) : scope;

      for (const declaration of (node.declarations ?? []) as AstNode[]) {
        declarePattern(declaration.id as AstNode | undefined, declarationScope);
      }
    } else if (
      node.type === "TSInterfaceDeclaration" ||
      node.type === "TSTypeAliasDeclaration" ||
      node.type === "TSEnumDeclaration" ||
      node.type === "TSModuleDeclaration" ||
      node.type === "TSDeclareFunction"
    ) {
      declarePattern(node.id as AstNode | undefined, scope);
    } else if (node.type === "ImportDeclaration") {
      for (const specifier of (node.specifiers ?? []) as AstNode[]) {
        declarePattern(specifier.local as AstNode | undefined, moduleScope);
      }
    }

    const keys = (visitorKeys as Record<string, string[]>)[node.type] ?? [];
    for (const key of keys) {
      const value = node[key];

      if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child)) {
            visit(
              child,
              scope,
              node,
              key,
              isFunctionNode(node) && key === "body" && child.type === "BlockStatement",
            );
          }
        }
      } else if (isNode(value)) {
        visit(
          value,
          scope,
          node,
          key,
          isFunctionNode(node) && key === "body" && value.type === "BlockStatement",
        );
      }
    }
  };

  visit(program, moduleScope, null, "");

  // Build scopes first, then collect every declaration. Lexical shadowing must
  // not depend on whether a declaration appears before its references.
  const collectDeclarations = (node: AstNode): void => {
    const scope = scopeByNode.get(node) ?? moduleScope;

    if (node.type === "VariableDeclaration") {
      const declarationScope = node.kind === "var" ? nearestFunctionScope(scope) : scope;

      for (const declaration of (node.declarations ?? []) as AstNode[]) {
        declarePattern(declaration.id as AstNode | undefined, declarationScope);
      }
    } else if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      const parent = parentByNode.get(node)?.parent;
      declarePattern(
        node.id as AstNode | undefined,
        parent ? (scopeByNode.get(parent) ?? moduleScope) : moduleScope,
      );
    } else if (
      node.type === "TSInterfaceDeclaration" ||
      node.type === "TSTypeAliasDeclaration" ||
      node.type === "TSEnumDeclaration" ||
      node.type === "TSModuleDeclaration" ||
      node.type === "TSDeclareFunction"
    ) {
      declarePattern(node.id as AstNode | undefined, scope);
    } else if (node.type === "ImportDeclaration") {
      for (const specifier of (node.specifiers ?? []) as AstNode[]) {
        declarePattern(specifier.local as AstNode | undefined, moduleScope);
      }
    }

    childrenOf(node, collectDeclarations);
  };

  collectDeclarations(program);
  return { moduleScope, scopeByNode, parentByNode };
}

function resolveLexicalBinding(
  scope: LexicalScope | undefined,
  name: string,
): LexicalBinding | undefined {
  let current: LexicalScope | null = scope ?? null;

  while (current) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
    current = current.parent;
  }

  return undefined;
}

function isScopeInside(scope: LexicalScope, ancestor: LexicalScope): boolean {
  let current: LexicalScope | null = scope;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isReferenceIdentifier(parent: AstNode | undefined, key: string | undefined): boolean {
  if (!parent || !key) return false;

  if (
    (parent.type === "VariableDeclarator" && key === "id") ||
    (isFunctionNode(parent) && (key === "id" || key === "params")) ||
    ((parent.type === "ClassDeclaration" || parent.type === "ClassExpression") && key === "id") ||
    (parent.type === "CatchClause" && key === "param") ||
    (parent.type === "ImportSpecifier" && (key === "imported" || key === "local")) ||
    (parent.type === "ImportDefaultSpecifier" && key === "local") ||
    (parent.type === "ImportNamespaceSpecifier" && key === "local") ||
    (parent.type === "ExportSpecifier" && key === "exported") ||
    (parent.type === "LabeledStatement" && key === "label") ||
    ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") &&
      key === "label") ||
    (parent.type === "MetaProperty" && (key === "meta" || key === "property"))
  ) {
    return false;
  }

  if (
    (parent.type === "Property" ||
      parent.type === "MethodDefinition" ||
      parent.type === "PropertyDefinition" ||
      parent.type === "FieldDefinition") &&
    key === "key" &&
    !parent.computed
  ) {
    return false;
  }

  if (parent.type === "MemberExpression" && key === "property" && !parent.computed) {
    return false;
  }

  // TypeScript wrapper nodes retain runtime expressions even though their
  // type children are erased from the generated JavaScript.
  if (
    parent.type === "TSAsExpression" ||
    parent.type === "TSSatisfiesExpression" ||
    parent.type === "TSTypeAssertion" ||
    parent.type === "TSNonNullExpression" ||
    parent.type === "TSInstantiationExpression"
  ) {
    return key === "expression";
  }

  if (parent.type.startsWith("TS")) {
    return false;
  }

  return true;
}

function isLexicalThisReference(
  node: AstNode,
  markedFunction: AstNode,
  parents: WeakMap<object, ParentInfo>,
): boolean {
  let current = parents.get(node)?.parent;

  while (current && current !== markedFunction) {
    if (isFunctionNode(current) && current.type !== "ArrowFunctionExpression") {
      return false;
    }
    current = parents.get(current)?.parent;
  }

  if (markedFunction.type !== "ArrowFunctionExpression") return false;

  // A top-level arrow has no enclosing receiver. Its lexical this is already
  // undefined in an extracted ESM server implementation, so it does not need
  // to be captured or serialized.
  current = parents.get(markedFunction)?.parent;
  while (current) {
    if (isFunctionNode(current) && current.type !== "ArrowFunctionExpression") {
      return true;
    }
    current = parents.get(current)?.parent;
  }

  return false;
}

function isRootThisReference(
  node: AstNode,
  markedFunction: AstNode,
  parents: WeakMap<object, ParentInfo>,
): boolean {
  let current = parents.get(node)?.parent;

  while (current && current !== markedFunction) {
    if (isFunctionNode(current) && current.type !== "ArrowFunctionExpression") {
      return false;
    }
    current = parents.get(current)?.parent;
  }

  return current === markedFunction && markedFunction.type !== "ArrowFunctionExpression";
}

function isReferenceInsideMarkedFunction(
  node: AstNode,
  markedFunction: AstNode,
  parents: WeakMap<object, ParentInfo>,
): boolean {
  let current: AstNode | undefined = node;

  while (current && current !== markedFunction) {
    current = parents.get(current)?.parent;
  }

  return current === markedFunction;
}

function isRootArgumentsReference(
  node: AstNode,
  markedFunction: AstNode,
  parents: WeakMap<object, ParentInfo>,
): boolean {
  let current = parents.get(node)?.parent;

  while (current && current !== markedFunction) {
    if (isFunctionNode(current) && current.type !== "ArrowFunctionExpression") {
      return false;
    }
    current = parents.get(current)?.parent;
  }

  return current === markedFunction;
}

function getUniqueIdentifier(source: string, base: string): string {
  let candidate = base;
  let suffix = 0;

  while (source.includes(candidate)) {
    candidate = base + "_" + ++suffix;
  }

  return candidate;
}

function isAssignmentTargetReference(node: AstNode, parents: WeakMap<object, ParentInfo>): boolean {
  let current = node;

  while (true) {
    const parentInfo = parents.get(current);
    if (!parentInfo) return false;

    const { parent, key } = parentInfo;

    if (
      (parent.type === "AssignmentExpression" && key === "left") ||
      (parent.type === "UpdateExpression" && key === "argument") ||
      ((parent.type === "ForInStatement" || parent.type === "ForOfStatement") && key === "left")
    ) {
      return true;
    }

    if (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") {
      return false;
    }

    if (
      (parent.type === "Property" && key === "value") ||
      (parent.type === "ObjectPattern" && key === "properties") ||
      (parent.type === "ArrayPattern" && key === "elements") ||
      (parent.type === "RestElement" && key === "argument") ||
      (parent.type === "AssignmentPattern" && key === "left") ||
      ((parent.type === "TSAsExpression" || parent.type === "TSTypeAssertion") &&
        key === "expression")
    ) {
      current = parent;
      continue;
    }

    return false;
  }
}

function isLexicalArgumentsReference(
  node: AstNode,
  markedFunction: AstNode,
  parents: WeakMap<object, ParentInfo>,
): boolean {
  let current = parents.get(node)?.parent;

  while (current && current !== markedFunction) {
    if (isFunctionNode(current) && current.type !== "ArrowFunctionExpression") {
      return false;
    }
    current = parents.get(current)?.parent;
  }

  if (markedFunction.type !== "ArrowFunctionExpression") return false;

  current = parents.get(markedFunction)?.parent;
  while (current) {
    if (isFunctionNode(current) && current.type !== "ArrowFunctionExpression") {
      return true;
    }
    current = parents.get(current)?.parent;
  }

  return false;
}

function analyzeServerFunctionCaptures(
  source: string,
  markedFunction: AstNode,
  digest: string,
  scopeAnalysis: ScopeAnalysis,
): CaptureAnalysis {
  const rootScope = scopeAnalysis.scopeByNode.get(markedFunction);
  if (!rootScope) {
    throw new Error("[Vynn use server] Internal compiler error: missing function scope.");
  }

  const captureByKey = new Map<object, ServerFunctionCapture>();
  const captures: ServerFunctionCapture[] = [];
  const capturesParameter = getUniqueIdentifier(source, "__vynn_captures_" + digest);

  const addCapture = (key: object, expression: string, reference: AstNode) => {
    let capture = captureByKey.get(key);
    if (!capture) {
      const index = captures.length;
      capture = {
        expression,
        alias: getUniqueIdentifier(source, "__VYNN_CAPTURE_" + digest + "_" + index),
        references: [],
      };
      captureByKey.set(key, capture);
      captures.push(capture);
    }
    capture.references.push(reference);
  };

  const visit = (node: AstNode): void => {
    const parentInfo = scopeAnalysis.parentByNode.get(node);
    const parent = parentInfo?.parent;
    const key = parentInfo?.key;

    if (node.type === "ThisExpression") {
      if (isLexicalThisReference(node, markedFunction, scopeAnalysis.parentByNode)) {
        addCapture(markedFunction, "this", node);
      } else if (isRootThisReference(node, markedFunction, scopeAnalysis.parentByNode)) {
        throw new Error(
          "[Vynn use server] Dynamic 'this' inside a server function is not supported. Capture the receiver in an outer variable instead.",
        );
      }
    } else if (
      node.type === "Super" &&
      isReferenceInsideMarkedFunction(node, markedFunction, scopeAnalysis.parentByNode)
    ) {
      throw new Error(
        "[Vynn use server] 'super' cannot be used inside an extracted server function. Capture the required value in an outer variable instead.",
      );
    } else if (
      node.type === "Identifier" &&
      node.name === "arguments" &&
      isRootArgumentsReference(node, markedFunction, scopeAnalysis.parentByNode)
    ) {
      if (isLexicalArgumentsReference(node, markedFunction, scopeAnalysis.parentByNode)) {
        addCapture(scopeAnalysis.moduleScope, "Array.prototype.slice.call(arguments)", node);
      } else {
        throw new Error(
          "[Vynn use server] 'arguments' inside a server function is not supported. Pass the required values as named parameters.",
        );
      }
    } else if (
      node.type === "Identifier" &&
      typeof node.name === "string" &&
      isReferenceIdentifier(parent, key)
    ) {
      const binding = resolveLexicalBinding(scopeAnalysis.scopeByNode.get(node), node.name);

      if (
        binding &&
        binding.scope !== scopeAnalysis.moduleScope &&
        !isScopeInside(binding.scope, rootScope)
      ) {
        const write = isAssignmentTargetReference(node, scopeAnalysis.parentByNode);

        if (write) {
          throw new Error(
            "[Vynn use server] Captured variable '" +
              node.name +
              "' cannot be reassigned inside a server function. Pass mutable values as arguments and return the updated value.",
          );
        }

        addCapture(binding, node.name, node);
      }
    } else if (
      node.type === "JSXIdentifier" &&
      typeof node.name === "string" &&
      (((parent?.type === "JSXOpeningElement" || parent?.type === "JSXClosingElement") &&
        key === "name" &&
        /^[A-Z]/.test(node.name)) ||
        (parent?.type === "JSXMemberExpression" && key === "object"))
    ) {
      const binding = resolveLexicalBinding(scopeAnalysis.scopeByNode.get(node), node.name);

      if (
        binding &&
        binding.scope !== scopeAnalysis.moduleScope &&
        !isScopeInside(binding.scope, rootScope)
      ) {
        addCapture(binding, node.name, node);
      }
    }

    childrenOf(node, visit);
  };

  visit(markedFunction);
  return { captures, capturesParameter, parentByNode: scopeAnalysis.parentByNode };
}

function createCaptureSourceEdits(
  analysis: CaptureAnalysis,
  sourceStart: number,
  sourceEnd: number,
  replacement: (capture: ServerFunctionCapture, index: number) => string,
): SourceEdit[] {
  const edits: SourceEdit[] = [];

  for (let index = 0; index < analysis.captures.length; index++) {
    const capture = analysis.captures[index];
    const value = replacement(capture, index);

    for (const reference of capture.references) {
      if (reference.start < sourceStart || reference.end > sourceEnd) continue;

      const parentInfo = analysis.parentByNode.get(reference);

      if (
        parentInfo?.parent.type === "Property" &&
        parentInfo.parent.shorthand &&
        parentInfo.key === "value" &&
        parentInfo.parent.start >= sourceStart &&
        parentInfo.parent.end <= sourceEnd
      ) {
        edits.push({
          start: parentInfo.parent.start - sourceStart,
          end: parentInfo.parent.end - sourceStart,
          content: String(reference.name) + ": " + value,
        });
      } else {
        edits.push({
          start: reference.start - sourceStart,
          end: reference.end - sourceStart,
          content: value,
        });
      }
    }
  }

  return edits;
}

function applyEdits(source: string, edits: SourceEdit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start);
  let result = source;
  let previousStart = source.length + 1;

  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      throw new Error("[Vynn use server] Internal compiler error: invalid source edit.");
    }
    if (edit.end > previousStart) {
      throw new Error(
        "[Vynn use server] A server-marked function contains another server-marked function. Nested server boundaries are not supported yet.",
      );
    }
    result = result.slice(0, edit.start) + edit.content + result.slice(edit.end);
    previousStart = edit.start;
  }

  return result;
}

function getTypeParametersSource(source: string, fn: AstNode): string {
  const typeParameters = (fn.typeParameters ?? fn.typeParams) as AstNode | undefined;
  if (
    typeParameters &&
    typeof typeParameters.start === "number" &&
    typeof typeParameters.end === "number"
  ) {
    return source.slice(typeParameters.start, typeParameters.end);
  }
  return "";
}

function makeExtractedImplementation(
  source: string,
  marked: MarkedFunction,
  analysis: CaptureAnalysis,
): string {
  const body = marked.fn.body as AstNode;
  const bodySource = source.slice(body.start, body.end);
  const bodyEdits = createCaptureSourceEdits(
    analysis,
    body.start,
    body.end,
    (capture) => capture.alias,
  );
  bodyEdits.push({
    start: marked.directive.start - body.start,
    end: marked.directive.end - body.start,
    content: "",
  });

  let rewrittenBody = applyEdits(bodySource, bodyEdits);
  const aliases = analysis.captures
    .map(
      (capture, index) =>
        "const " + capture.alias + " = " + analysis.capturesParameter + "[" + index + "];",
    )
    .join("\n");
  if (aliases) {
    rewrittenBody = "{" + "\n" + aliases + "\n" + rewrittenBody.slice(1);
  }

  const typeParameters = getTypeParametersSource(source, marked.fn);
  const params = ((marked.fn.params ?? []) as AstNode[])
    .map((param) => {
      const parameterSource = source.slice(param.start, param.end);
      const parameterEdits = createCaptureSourceEdits(
        analysis,
        param.start,
        param.end,
        (_capture, index) => analysis.capturesParameter + "[" + index + "]",
      );
      return applyEdits(parameterSource, parameterEdits);
    })
    .join(", ");
  const implementationParams = [analysis.capturesParameter, params].filter(Boolean).join(", ");
  const asyncPrefix = marked.fn.async ? "async " : "";

  return (
    "export " +
    asyncPrefix +
    "function " +
    marked.exportName +
    typeParameters +
    "(" +
    implementationParams +
    ") " +
    rewrittenBody
  );
}

function makeReplacement(
  marked: MarkedFunction,
  target: ServerFunctionTarget,
  analysis: CaptureAnalysis,
): SourceEdit {
  const { fn, parent } = marked;
  const captureProvider =
    ", () => [" + analysis.captures.map((capture) => capture.expression).join(", ") + "]";
  const reference =
    target === "server"
      ? `${CREATE_SERVER_REFERENCE}(${marked.exportName}, ${JSON.stringify(marked.id)}${captureProvider})`
      : `${CREATE_SERVER_REFERENCE}(${JSON.stringify(marked.id)}${captureProvider})`;

  if (fn.type !== "FunctionDeclaration") {
    return { start: fn.start, end: fn.end, content: reference };
  }

  const identifier = fn.id as AstNode | undefined;
  const name = identifier?.name;
  if (typeof name !== "string" || !name) {
    throw new Error(
      "Anonymous function declarations with a directive are not supported. Assign the function a name.",
    );
  }

  if (parent?.type === "ExportNamedDeclaration") {
    return {
      start: parent.start,
      end: parent.end,
      content: `export const ${name} = ${reference};`,
    };
  }

  if (parent?.type === "ExportDefaultDeclaration") {
    return {
      start: parent.start,
      end: parent.end,
      content: `const ${name} = ${reference};\nexport default ${name};`,
    };
  }

  return {
    start: fn.start,
    end: fn.end,
    content: `const ${name} = ${reference};`,
  };
}

/**
 * Transforms function-level "use server" directives without depending on a
 * particular build tool. The build integration supplies its runtime module
 * specifier and chooses either the client or server transform target.
 */
export function transformServerFunctions(
  source: string,
  id: string,
  options: TransformServerFunctionsOptions,
): TransformServerFunctionsResult | null {
  const cleanId = cleanModuleId(id);
  if (!SCRIPT_EXTENSION_RE.test(cleanId) || !source.includes("use server")) return null;

  const moduleId = resolve(options.root, cleanId);
  let parsed: ReturnType<typeof parseSync>;
  try {
    parsed = parseSync(cleanId, source, {
      lang: inferParserLanguage(cleanId),
      sourceType: "module",
      astType: "ts",
      preserveParens: false,
      showSemanticErrors: false,
    } as never);
  } catch (error) {
    throw new Error(
      `[Vynn use server] Could not parse ${cleanId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const diagnostics =
    (
      parsed as unknown as {
        errors?: Array<{ severity?: string | number; message?: string }>;
        diagnostics?: Array<{ severity?: string | number; message?: string }>;
      }
    ).errors ??
    (
      parsed as unknown as {
        diagnostics?: Array<{ severity?: string | number; message?: string }>;
      }
    ).diagnostics ??
    [];
  const fatalErrors = diagnostics.filter(
    (error) => error.severity === "Error" || error.severity === 2 || !("severity" in error),
  );
  if (fatalErrors.length > 0) {
    throw new Error(
      `[Vynn use server] Could not parse ${cleanId}:\n${fatalErrors
        .map((error) => error.message ?? String(error))
        .join("\n")}`,
    );
  }

  const program = parsed.program as unknown as AstNode;
  const body = (program.body ?? []) as AstNode[];
  for (const statement of body) {
    const value = getDirectiveValue(statement);
    if (value === "use server") {
      throw new Error(
        `[Vynn use server] File-level "use server" is not supported yet. Put the directive inside a function body (${cleanId}).`,
      );
    }
    if (value === undefined) break;
  }

  const marked = collectMarkedFunctions(program, options.root, moduleId);
  if (marked.length === 0) return null;

  if (containsNestedMarkedBoundary(marked, program)) {
    throw new Error(
      `[Vynn use server] A server-marked function cannot contain another server-marked function yet (${cleanId}).`,
    );
  }

  const scopeAnalysis = buildScopeAnalysis(program);
  const captureAnalysis = new Map<MarkedFunction, CaptureAnalysis>();
  for (const item of marked) {
    captureAnalysis.set(
      item,
      analyzeServerFunctionCaptures(source, item.fn, item.id.slice("vynn_".length), scopeAnalysis),
    );
  }

  const edits = marked.map((item) =>
    makeReplacement(item, options.target, captureAnalysis.get(item)!),
  );
  let code = applyEdits(source, edits);
  if (options.target === "server") {
    const implementations = marked
      .map((item) => makeExtractedImplementation(source, item, captureAnalysis.get(item)!))
      .join("\n\n");
    code += `\n\n// Vynn extracted server functions\n${implementations}\n`;
  }

  const defaultRuntime =
    options.target === "server" ? "vynn/server-functions/server" : "vynn/server-functions/client";
  const runtimeModule = options.runtimeModule ?? defaultRuntime;
  code =
    `import { createServerReference as ${CREATE_SERVER_REFERENCE} } from ${JSON.stringify(runtimeModule)};\n` +
    code;

  return {
    code,
    map: null,
    functions: marked.map(({ id: functionId, exportName }) => ({
      id: functionId,
      moduleId,
      exportName,
    })),
  };
}
