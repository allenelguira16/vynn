/**
 * Vynn JSX transform implemented on Oxc's ESTree AST.
 *
 * This is a Vite/Rollup transform plugin backed by `oxc-parser`; it is not an
 * `oxc-transform` custom plugin because Oxc does not currently expose a public
 * arbitrary-transform plugin API equivalent to Babel's PluginAPI.
 *
 * Dependencies:
 *   oxc-parser
 *   esrap
 *   vite (type-only, for the Vite adapter)
 *
 * Comments are passed to esrap with reconstructed source locations. Because
 * JSX lowering replaces source nodes, comment placement around JSX-empty
 * expressions and generated wrappers still needs fixture tests before this
 * should be treated as a production compiler.
 */

import { parseSync, visitorKeys } from "oxc-parser";
import { decodeHTML } from "entities";
import { print } from "esrap";
import tsx from "esrap/languages/tsx";
import type { Plugin, Rolldown } from "vite";

type Node = any;
type RuntimeHelperName =
  | "$dyn"
  | "$text"
  | "$tmpl"
  | "$cmpnt"
  | "$insert"
  | "$attr"
  | "$on"
  | "$spread"
  | "$for";

type ReactivePluginOptions = {
  /** Override parser language. Usually inferred from the file extension. */
  lang?: "js" | "jsx" | "ts" | "tsx";
  /** Source module type; Vynn modules are normally ESM. */
  sourceType?: "module" | "script" | "unambiguous";
  /** Set false to disable this transform for a matching file. */
  enabled?: boolean;
};

type IdentifierAllocator = {
  nextElement(): Node;
};

const runtimeImportSource = "vynn/render";
const expressionTypes = new Set<string>([
  "ArrayExpression",
  "ArrowFunctionExpression",
  "AssignmentExpression",
  "AwaitExpression",
  "BinaryExpression",
  "CallExpression",
  "ChainExpression",
  "ClassExpression",
  "ConditionalExpression",
  "FunctionExpression",
  "Identifier",
  "ImportExpression",
  "JSXElement",
  "JSXFragment",
  "Literal",
  "LogicalExpression",
  "MemberExpression",
  "MetaProperty",
  "NewExpression",
  "ObjectExpression",
  "SequenceExpression",
  "TaggedTemplateExpression",
  "TemplateLiteral",
  "ThisExpression",
  "UnaryExpression",
  "UpdateExpression",
  "YieldExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
  "PrivateIdentifier",
]);

const isNode = (node: unknown): node is Node =>
  !!node && typeof node === "object" && typeof (node as Node).type === "string";
const isType = (node: Node, type: string): boolean =>
  !!node && node.type === type;
const isIdentifier = (node: Node): boolean => isType(node, "Identifier");
const isJSXIdentifier = (node: Node): boolean => isType(node, "JSXIdentifier");
const isExpression = (node: Node): boolean =>
  !!node && expressionTypes.has(node.type);
const isFunctionLike = (node: Node): boolean =>
  isType(node, "ArrowFunctionExpression") ||
  isType(node, "FunctionExpression") ||
  isType(node, "FunctionDeclaration");
const isLiteralString = (node: Node): boolean =>
  isType(node, "Literal") && typeof node.value === "string";
const isNumericLiteral = (node: Node): boolean =>
  isType(node, "Literal") && typeof node.value === "number";
const isStringLiteral = isLiteralString;
const isJSXElement = (node: Node): boolean => isType(node, "JSXElement");
const isJSXFragment = (node: Node): boolean => isType(node, "JSXFragment");
const isJSXText = (node: Node): boolean => isType(node, "JSXText");
const isJSXExpressionContainer = (node: Node): boolean =>
  isType(node, "JSXExpressionContainer");
const isJSXEmptyExpression = (node: Node): boolean =>
  isType(node, "JSXEmptyExpression");
const isJSXAttribute = (node: Node): boolean => isType(node, "JSXAttribute");
const isJSXSpreadAttribute = (node: Node): boolean =>
  isType(node, "JSXSpreadAttribute");
const isJSXMemberExpression = (node: Node): boolean =>
  isType(node, "JSXMemberExpression");
const isCallExpression = (node: Node): boolean =>
  isType(node, "CallExpression");
const isMemberExpression = (node: Node): boolean =>
  isType(node, "MemberExpression");
const isArrowFunctionExpression = (node: Node): boolean =>
  isType(node, "ArrowFunctionExpression");
const isFunctionExpression = (node: Node): boolean =>
  isType(node, "FunctionExpression");
const isFunctionDeclaration = (node: Node): boolean =>
  isType(node, "FunctionDeclaration");
const isBlockStatement = (node: Node): boolean =>
  isType(node, "BlockStatement");
const isReturnStatement = (node: Node): boolean =>
  isType(node, "ReturnStatement");
const isVariableDeclaration = (node: Node): boolean =>
  isType(node, "VariableDeclaration");
const isExpressionStatement = (node: Node): boolean =>
  isType(node, "ExpressionStatement");
const isObjectExpression = (node: Node): boolean =>
  isType(node, "ObjectExpression");
const isObjectProperty = (node: Node): boolean =>
  isType(node, "Property") && !node.method && node.kind === "init";
const isObjectMethod = (node: Node): boolean =>
  isType(node, "Property") &&
  (node.method || node.kind === "get" || node.kind === "set");
const isSpreadElement = (node: Node): boolean => isType(node, "SpreadElement");
const isArrayExpression = (node: Node): boolean =>
  isType(node, "ArrayExpression");
const isRestElement = (node: Node): boolean => isType(node, "RestElement");
const isAssignmentPattern = (node: Node): boolean =>
  isType(node, "AssignmentPattern");
const isObjectPattern = (node: Node): boolean => isType(node, "ObjectPattern");
const isArrayPattern = (node: Node): boolean => isType(node, "ArrayPattern");
const isIfStatement = (node: Node): boolean => isType(node, "IfStatement");
const isLogicalExpression = (node: Node): boolean =>
  isType(node, "LogicalExpression");
const isConditionalExpression = (node: Node): boolean =>
  isType(node, "ConditionalExpression");
const isUnaryExpression = (node: Node): boolean =>
  isType(node, "UnaryExpression");
const isAwaitExpression = (node: Node): boolean =>
  isType(node, "AwaitExpression");
const isUpdateExpression = (node: Node): boolean =>
  isType(node, "UpdateExpression");
const isAssignmentExpression = (node: Node): boolean =>
  isType(node, "AssignmentExpression");
const isBinaryExpression = (node: Node): boolean =>
  isType(node, "BinaryExpression");
const isTemplateLiteral = (node: Node): boolean =>
  isType(node, "TemplateLiteral");
const isSequenceExpression = (node: Node): boolean =>
  isType(node, "SequenceExpression");
const isTSAsExpression = (node: Node): boolean =>
  isType(node, "TSAsExpression");
const isTSNonNullExpression = (node: Node): boolean =>
  isType(node, "TSNonNullExpression");
const isImportDeclaration = (node: Node): boolean =>
  isType(node, "ImportDeclaration");
const isImportSpecifier = (node: Node): boolean =>
  isType(node, "ImportSpecifier");

function identifier(name: string): Node {
  return { type: "Identifier", name };
}
function literal(value: string | number | boolean | null): Node {
  return {
    type: "Literal",
    value,
    raw: typeof value === "string" ? JSON.stringify(value) : String(value),
  };
}
function stringLiteral(value: string): Node {
  return literal(value);
}
function numericLiteral(value: number): Node {
  return literal(value);
}
function booleanLiteral(value: boolean): Node {
  return literal(value);
}
function voidZero(): Node {
  return {
    type: "UnaryExpression",
    operator: "void",
    prefix: true,
    argument: numericLiteral(0),
  };
}
function cloneNode<T extends Node>(node: T): T {
  return structuredClone(node);
}
function memberExpression(
  object: Node,
  property: Node,
  computed = false,
): Node {
  return {
    type: "MemberExpression",
    object,
    property,
    computed,
    optional: false,
  };
}
function callExpression(callee: Node, args: Node[]): Node {
  return { type: "CallExpression", callee, arguments: args, optional: false };
}
function arrowFunctionExpression(params: Node[], body: Node): Node {
  return {
    type: "ArrowFunctionExpression",
    id: null,
    params,
    body,
    generator: false,
    async: false,
    expression: !isBlockStatement(body),
  };
}
function functionExpression(
  id: Node | null,
  params: Node[],
  body: Node,
  generator = false,
  async = false,
): Node {
  return {
    type: "FunctionExpression",
    id,
    params,
    body,
    generator,
    async,
    expression: false,
  };
}
function blockStatement(body: Node[]): Node {
  return { type: "BlockStatement", body };
}
function returnStatement(argument: Node | null): Node {
  return { type: "ReturnStatement", argument };
}
function expressionStatement(expression: Node): Node {
  return { type: "ExpressionStatement", expression };
}
function variableDeclarator(id: Node, init: Node | null): Node {
  return { type: "VariableDeclarator", id, init, definite: false };
}
function variableDeclaration(
  kind: "const" | "let" | "var",
  declarations: Node[],
): Node {
  return { type: "VariableDeclaration", kind, declarations };
}
function arrayExpression(elements: Array<Node | null>): Node {
  return { type: "ArrayExpression", elements };
}
function objectExpression(properties: Node[]): Node {
  return { type: "ObjectExpression", properties };
}
function spreadElement(argument: Node): Node {
  return { type: "SpreadElement", argument };
}
function unaryExpression(operator: string, argument: Node): Node {
  return { type: "UnaryExpression", operator, argument, prefix: true };
}
function binaryExpression(operator: string, left: Node, right: Node): Node {
  return { type: "BinaryExpression", operator, left, right };
}
function conditionalExpression(
  test: Node,
  consequent: Node,
  alternate: Node,
): Node {
  return { type: "ConditionalExpression", test, consequent, alternate };
}
function assignmentExpression(operator: string, left: Node, right: Node): Node {
  return { type: "AssignmentExpression", operator, left, right };
}
function propertyKey(name: string): Node {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    ? identifier(name)
    : stringLiteral(name);
}
function objectProperty(
  key: Node,
  value: Node,
  options: Partial<Node> = {},
): Node {
  return {
    type: "Property",
    key,
    value,
    kind: options.kind ?? "init",
    method: options.method ?? false,
    shorthand: options.shorthand ?? false,
    computed: options.computed ?? false,
  };
}
function objectMethod(
  kind: "method" | "get" | "set",
  key: Node,
  params: Node[],
  body: Node,
): Node {
  const fn = functionExpression(null, params, body);
  return objectProperty(key, fn, {
    kind: kind === "method" ? "init" : kind,
    method: kind === "method",
  });
}
function importSpecifier(local: Node, imported: Node): Node {
  return { type: "ImportSpecifier", imported, local, importKind: "value" };
}
function importDeclaration(specifiers: Node[], source: string): Node {
  return {
    type: "ImportDeclaration",
    specifiers,
    source: stringLiteral(source),
    importKind: "value",
    assertions: [],
    attributes: [],
  };
}

function getVisitorKeys(node: Node): string[] {
  const keys = (visitorKeys as Record<string, string[]>)[node.type];
  if (keys) return keys;
  return [];
}

function forEachChild(node: Node, callback: (child: Node) => void): void {
  for (const key of getVisitorKeys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) callback(child);
    } else if (isNode(value)) {
      callback(value);
    }
  }
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function getJSXIdentifierName(name: Node): string {
  if (isJSXIdentifier(name)) return name.name;
  throw new Error(
    "Vynn currently only supports simple JSX identifiers for native elements.",
  );
}

function isComponentElement(node: Node): boolean {
  const name = node.openingElement.name;
  if (isJSXIdentifier(name)) return isComponentName(name.name);
  return isJSXMemberExpression(name);
}

function isArrowComponentDeclaration(declaration: Node): boolean {
  return (
    isIdentifier(declaration.id) &&
    isComponentName(declaration.id.name) &&
    isArrowFunctionExpression(declaration.init)
  );
}

function findReturnStatement(node: Node): Node | undefined {
  if (!isBlockStatement(node.body)) return undefined;
  return node.body.body.find((statement: Node) => isReturnStatement(statement));
}

function findArrowReturnStatement(body: Node): Node | undefined {
  if (!isBlockStatement(body)) return undefined;
  return body.body.find((statement: Node) => isReturnStatement(statement));
}

function normalizeJSXText(value: string): string {
  // JSX text supports HTML character references. Decode only JSXText nodes,
  // not ordinary JavaScript string literals such as {"&nbsp;"}.
  // Normalize source indentation first so references such as &NewLine; are
  // decoded after the raw JSX whitespace rules have been applied.
  if (!value.includes("\n") && !value.includes("\r")) {
    return decodeHTML(value);
  }

  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, " ").trimStart();
    if (i !== lines.length - 1) line = line.trimEnd();
    if (!line.trim()) continue;
    normalized.push(line);
  }

  return decodeHTML(normalized.join(" "));
}

function inferLang(filename: string): "js" | "jsx" | "ts" | "tsx" {
  if (/\.tsx$/i.test(filename)) return "tsx";
  if (
    /\.ts$/i.test(filename) ||
    /\.mts$/i.test(filename) ||
    /\.cts$/i.test(filename)
  )
    return "ts";
  // .js files often contain JSX in Vynn applications, so use the JSX parser.
  return "jsx";
}

function createPositionLookup(
  source: string,
): (offset: number) => { line: number; column: number } {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  return (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (lineStarts[mid] <= offset) low = mid + 1;
      else high = mid - 1;
    }
    const index = Math.max(0, high);
    return { line: index + 1, column: offset - lineStarts[index] };
  };
}

function addSourceLocations(program: Node, source: string): void {
  const positionAt = createPositionLookup(source);
  const visit = (node: Node): void => {
    if (!isNode(node)) return;
    if (
      typeof node.start === "number" &&
      typeof node.end === "number" &&
      !node.loc
    ) {
      node.loc = { start: positionAt(node.start), end: positionAt(node.end) };
    }
    forEachChild(node, visit);
  };
  visit(program);
}

function programContainsJSX(program: Node): boolean {
  if (!isNode(program)) return false;
  if (isJSXElement(program) || isJSXFragment(program)) return true;
  for (const key of getVisitorKeys(program)) {
    const value = program[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child) && programContainsJSX(child)) return true;
      }
    } else if (isNode(value) && programContainsJSX(value)) {
      return true;
    }
  }
  return false;
}

function inheritSourceLocation<T extends Node>(target: T, source: Node): T {
  const mutableTarget: Node = target;
  if (typeof source?.start === "number") mutableTarget.start = source.start;
  if (typeof source?.end === "number") mutableTarget.end = source.end;
  if (source?.loc) mutableTarget.loc = source.loc;
  if (source?.range) mutableTarget.range = source.range;
  return target;
}

/** Transform one source module with Oxc's ESTree-compatible parser. */
export function transformVynnOxc(
  source: string,
  filename = "module.tsx",
  options: ReactivePluginOptions = {},
): string {
  return compileVynnOxc(source, filename, options).code;
}

type TransformOutput = { code: string; map: Rolldown.SourceMapInput | null };

function compileVynnOxc(
  source: string,
  filename: string,
  options: ReactivePluginOptions = {},
): TransformOutput {
  const lang = options.lang ?? inferLang(filename);
  const parsed = parseSync(filename, source, {
    lang,
    sourceType: options.sourceType ?? "module",
    astType: "ts",
    preserveParens: false,
    showSemanticErrors: false,
  } as never) as any;

  const parseErrors: any[] = parsed.errors ?? parsed.diagnostics ?? [];
  const fatal = parseErrors.filter(
    (error) =>
      error.severity === "Error" ||
      error.severity === 2 ||
      !("severity" in error),
  );
  if (fatal.length > 0) {
    const messages = fatal
      .map((error) => error.message ?? String(error))
      .join("\n");
    throw new Error(`Oxc failed to parse ${filename}:\n${messages}`);
  }

  const program: Node = parsed.program;
  if (!programContainsJSX(program)) return { code: source, map: null };
  addSourceLocations(program, source);
  const state = new TransformState(program, filename);
  state.transformProgram();

  // Oxc exposes comment spans as offsets. esrap accepts ESTree-style comment
  // locations, so convert them before printing to keep ordinary JS/TS comments.
  const positionAt = createPositionLookup(source);
  const comments = (parsed.comments ?? []).map((comment: Node) => ({
    type: comment.type,
    value: comment.value,
    loc: {
      start: positionAt(comment.start),
      end: positionAt(comment.end),
    },
  }));
  const output = print(
    program,
    tsx({ comments }) as never,
    {
      sourceMapSource: filename,
      sourceMapContent: source,
    } as never,
  );
  // esrap currently exposes its generated map as `unknown`; it is a raw
  // source-map object compatible with Rolldown/Vite's SourceMapInput.
  const map = output.map as Rolldown.SourceMapInput | undefined;
  return { code: output.code, map: map ?? null };
}

class TransformState {
  private readonly program: Node;
  private readonly filename: string;
  private readonly runtimeHelpers = new Map<RuntimeHelperName, Node>();
  private readonly generatedForExpressions = new WeakSet<object>();
  private readonly generatedForIndexReferences = new WeakSet<object>();
  private activeForIndexNames: string[] = [];
  private readonly usedNames = new Set<string>();

  constructor(program: Node, filename: string) {
    this.program = program;
    this.filename = filename;
    this.collectUsedNames(program);
  }

  private collectUsedNames(node: Node): void {
    if (isIdentifier(node)) this.usedNames.add(node.name);
    forEachChild(node, (child) => this.collectUsedNames(child));
  }

  private generateUidIdentifier(hint: string): Node {
    const cleanHint =
      hint.replace(/^\$+/, "").replace(/[^A-Za-z0-9_$]/g, "") || "ref";
    const base = `_${cleanHint}`;
    let name = base;
    let suffix = 1;
    while (this.usedNames.has(name)) name = `${base}${suffix++}`;
    this.usedNames.add(name);
    return identifier(name);
  }

  private createIdentifierAllocator(): IdentifierAllocator {
    let elementIndex = 0;
    return {
      nextElement: () => {
        let name: string;
        do {
          name = `el${++elementIndex}`;
        } while (this.usedNames.has(name));
        this.usedNames.add(name);
        return identifier(name);
      },
    };
  }

  private findExistingRuntimeImport(name: RuntimeHelperName): Node | null {
    for (const statement of this.program.body as Node[]) {
      if (
        !isImportDeclaration(statement) ||
        statement.source?.value !== runtimeImportSource
      )
        continue;
      for (const specifier of statement.specifiers ?? []) {
        if (!isImportSpecifier(specifier)) continue;
        const importedName = isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported?.value;
        if (importedName === name) return specifier.local;
      }
    }
    return null;
  }

  private getRuntimeHelper(name: RuntimeHelperName): Node {
    const existing = this.runtimeHelpers.get(name);
    if (existing) return existing;

    const imported = this.findExistingRuntimeImport(name);
    if (imported) {
      this.runtimeHelpers.set(name, imported);
      return imported;
    }

    const local = this.generateUidIdentifier(name);
    this.runtimeHelpers.set(name, local);
    return local;
  }

  private injectRuntimeImports(): void {
    if (this.runtimeHelpers.size === 0) return;

    let existingImport: Node | undefined;
    for (const statement of this.program.body as Node[]) {
      if (
        isImportDeclaration(statement) &&
        statement.source?.value === runtimeImportSource
      ) {
        existingImport = statement;
        break;
      }
    }

    if (existingImport) {
      for (const [name, local] of this.runtimeHelpers) {
        const alreadyImported = (existingImport.specifiers ?? []).some(
          (specifier: Node) => {
            if (!isImportSpecifier(specifier)) return false;
            const importedName = isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported?.value;
            return (
              importedName === name && specifier.local?.name === local.name
            );
          },
        );
        if (!alreadyImported) {
          existingImport.specifiers.push(
            importSpecifier(cloneNode(local), identifier(name)),
          );
        }
      }
      return;
    }

    const specifiers = [...this.runtimeHelpers].map(([name, local]) =>
      importSpecifier(cloneNode(local), identifier(name)),
    );
    this.program.body.unshift(
      importDeclaration(specifiers, runtimeImportSource),
    );
  }

  transformProgram(): void {
    this.program.body = (this.program.body as Node[]).map((statement) =>
      this.transformTopLevelStatement(statement),
    );
    this.injectRuntimeImports();
  }

  private transformTopLevelStatement(statement: Node): Node {
    // Export wrappers need special handling because a function declaration is
    // replaced by `const Component = $cmpnt(...)`.
    if (
      isType(statement, "ExportDefaultDeclaration") &&
      isFunctionDeclaration(statement.declaration)
    ) {
      const declaration = statement.declaration;
      if (declaration.id && isComponentName(declaration.id.name)) {
        const transformed = this.transformComponentDeclaration(declaration);
        if (
          isVariableDeclaration(transformed) &&
          transformed.declarations.length === 1
        ) {
          return inheritSourceLocation(
            {
              ...statement,
              declaration: transformed.declarations[0].init,
            },
            statement,
          );
        }
      }
      statement.declaration = this.visitNestedDeclarations(declaration);
      return statement;
    }
    return this.visitNestedDeclarations(statement);
  }

  /**
   * Babel's visitors also reached declarators nested under export wrappers,
   * ordinary functions, conditionals and blocks. Walk those structures while
   * only transforming component declarations and variable initializers here;
   * component bodies and arbitrary expressions have their own lowering path.
   */
  private visitNestedDeclarations(node: Node): Node {
    if (!isNode(node)) return node;

    if (
      isFunctionDeclaration(node) &&
      node.id &&
      isComponentName(node.id.name)
    ) {
      const transformed = this.transformComponentDeclaration(node);
      if (transformed !== node) return transformed;
    }

    if (isVariableDeclaration(node)) {
      for (const declaration of node.declarations as Node[]) {
        if (
          isArrowComponentDeclaration(declaration) &&
          this.transformArrowComponent(declaration)
        ) {
          continue;
        }
        if (declaration.init && isExpression(declaration.init)) {
          this.assertJSXInitializerIsLazy(declaration);
          declaration.init = this.transformEmbeddedExpression(
            declaration.init,
            this.createIdentifierAllocator(),
          );
        }
      }
      return node;
    }

    for (const key of getVisitorKeys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        node[key] = value.map((child: Node) =>
          isNode(child) ? this.visitNestedDeclarations(child) : child,
        );
      } else if (isNode(value)) {
        node[key] = this.visitNestedDeclarations(value);
      }
    }
    return node;
  }

  private transformComponentDeclaration(node: Node): Node {
    const returnStatement = findReturnStatement(node);
    if (!returnStatement?.argument) return node;

    const allocator = this.createIdentifierAllocator();
    this.transformComponentBody(node.body, returnStatement, allocator);

    const statements: Node[] = [];
    returnStatement.argument = this.transformStatementContextExpression(
      returnStatement.argument,
      allocator,
      statements,
      isJSXFragment(returnStatement.argument),
    );

    if (statements.length > 0) {
      const body: Node[] = node.body.body;
      const returnIndex = body.indexOf(returnStatement);
      if (returnIndex !== -1) body.splice(returnIndex, 0, ...statements);
    }

    const fn = functionExpression(
      cloneNode(node.id),
      node.params,
      node.body,
      !!node.generator,
      !!node.async,
    );
    return inheritSourceLocation(
      variableDeclaration("const", [
        variableDeclarator(
          cloneNode(node.id),
          inheritSourceLocation(
            callExpression(this.getRuntimeHelper("$cmpnt"), [fn]),
            node,
          ),
        ),
      ]),
      node,
    );
  }

  private transformArrowComponent(declaration: Node): boolean {
    if (!isArrowComponentDeclaration(declaration)) return false;
    const arrow = declaration.init;
    const allocator = this.createIdentifierAllocator();

    if (isBlockStatement(arrow.body)) {
      const returnStatement = findArrowReturnStatement(arrow.body);
      if (!returnStatement?.argument) return false;

      this.transformComponentBody(arrow.body, returnStatement, allocator);
      const statements: Node[] = [];
      returnStatement.argument = this.transformStatementContextExpression(
        returnStatement.argument,
        allocator,
        statements,
        isJSXFragment(returnStatement.argument),
      );
      if (statements.length > 0) {
        const body: Node[] = arrow.body.body;
        const returnIndex = body.indexOf(returnStatement);
        if (returnIndex !== -1) body.splice(returnIndex, 0, ...statements);
      }

      declaration.init = inheritSourceLocation(
        callExpression(this.getRuntimeHelper("$cmpnt"), [
          functionExpression(
            identifier(declaration.id.name),
            arrow.params,
            arrow.body,
            !!arrow.generator,
            !!arrow.async,
          ),
        ]),
        arrow,
      );
      return true;
    }

    const statements: Node[] = [];
    const transformedBody = this.transformStatementContextExpression(
      arrow.body,
      allocator,
      statements,
      isJSXFragment(arrow.body),
    );
    statements.push(returnStatement(transformedBody));
    declaration.init = inheritSourceLocation(
      callExpression(this.getRuntimeHelper("$cmpnt"), [
        functionExpression(
          identifier(declaration.id.name),
          arrow.params,
          blockStatement(statements),
          !!arrow.generator,
          !!arrow.async,
        ),
      ]),
      arrow,
    );
    return true;
  }

  private transformComponentBody(
    body: Node,
    rootReturn: Node,
    allocator: IdentifierAllocator,
  ): void {
    body.body = body.body.map((statement: Node) =>
      statement === rootReturn
        ? statement
        : this.transformStatement(statement, allocator),
    );
  }

  private getForIndexName(parameter: Node | null | undefined): string | null {
    if (isIdentifier(parameter)) return parameter.name;
    if (isAssignmentPattern(parameter) && isIdentifier(parameter.left))
      return parameter.left.name;
    return null;
  }

  private collectBindingNames(
    node: Node | null | undefined,
    names = new Set<string>(),
  ): Set<string> {
    if (!node) return names;
    if (isIdentifier(node)) {
      names.add(node.name);
      return names;
    }
    if (isRestElement(node))
      return this.collectBindingNames(node.argument, names);
    if (isAssignmentPattern(node))
      return this.collectBindingNames(node.left, names);
    if (isObjectPattern(node)) {
      for (const property of node.properties as Node[]) {
        if (isRestElement(property))
          this.collectBindingNames(property.argument, names);
        else if (isType(property, "Property"))
          this.collectBindingNames(property.value, names);
      }
      return names;
    }
    if (isArrayPattern(node)) {
      for (const element of node.elements as Array<Node | null>) {
        if (element) this.collectBindingNames(element, names);
      }
    }
    return names;
  }

  private withForCallback<T>(parameters: Node[], callback: () => T): T {
    const previous = this.activeForIndexNames;
    const shadowed = new Set<string>();
    for (const parameter of parameters)
      this.collectBindingNames(parameter, shadowed);
    const next = previous.filter((name) => !shadowed.has(name));
    const indexName = this.getForIndexName(parameters[1]);
    this.activeForIndexNames = indexName ? [...next, indexName] : next;
    try {
      return callback();
    } finally {
      this.activeForIndexNames = previous;
    }
  }

  private withShadowedForIndices<T>(parameters: Node[], callback: () => T): T {
    const previous = this.activeForIndexNames;
    const shadowed = new Set<string>();
    for (const parameter of parameters)
      this.collectBindingNames(parameter, shadowed);
    this.activeForIndexNames = previous.filter((name) => !shadowed.has(name));
    try {
      return callback();
    } finally {
      this.activeForIndexNames = previous;
    }
  }

  private transformForIndexReference(expression: Node): Node {
    if (
      !isIdentifier(expression) ||
      !this.activeForIndexNames.includes(expression.name)
    )
      return expression;
    const result = memberExpression(
      identifier(expression.name),
      identifier("value"),
    );
    this.generatedForIndexReferences.add(result);
    return result;
  }

  private isRuntimeHelperCall(
    expression: Node,
    name: RuntimeHelperName,
  ): boolean {
    const helper = this.runtimeHelpers.get(name);
    return (
      !!helper &&
      isCallExpression(expression) &&
      isIdentifier(expression.callee) &&
      expression.callee.name === helper.name
    );
  }

  private isForExpression(expression: Node): boolean {
    return this.isRuntimeHelperCall(expression, "$for");
  }

  private isTextExpression(expression: Node): boolean {
    return this.isRuntimeHelperCall(expression, "$text");
  }

  private containsJSX(node: Node | null | undefined): boolean {
    if (!node) return false;
    if (isJSXElement(node) || isJSXFragment(node)) return true;
    if (isCallExpression(node) && this.isJSXMapExpression(node)) return true;
    if (isFunctionLike(node)) return false;
    for (const key of getVisitorKeys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value)
          if (isNode(child) && this.containsJSX(child)) return true;
      } else if (isNode(value) && this.containsJSX(value)) return true;
    }
    return false;
  }

  private mapCallbackReturnsJSX(callback: Node): boolean {
    if (isArrowFunctionExpression(callback)) {
      if (callback.async) return false;
      if (isBlockStatement(callback.body)) {
        return callback.body.body.some(
          (statement: Node) =>
            isReturnStatement(statement) &&
            this.containsJSX(statement.argument),
        );
      }
      return this.containsJSX(callback.body);
    }
    if (isFunctionExpression(callback)) {
      if (callback.async) return false;
      return callback.body.body.some(
        (statement: Node) =>
          isReturnStatement(statement) && this.containsJSX(statement.argument),
      );
    }
    return false;
  }

  private isJSXMapExpression(expression: Node): boolean {
    if (!isCallExpression(expression) || expression.arguments.length !== 1)
      return false;
    const callee = expression.callee;
    if (!isMemberExpression(callee)) return false;
    if (callee.computed) {
      if (!isLiteralString(callee.property) || callee.property.value !== "map")
        return false;
    } else if (
      !isIdentifier(callee.property) ||
      callee.property.name !== "map"
    ) {
      return false;
    }
    const callback = expression.arguments[0];
    return isExpression(callback) && this.mapCallbackReturnsJSX(callback);
  }

  private createArrayIdentityFor(array: Node): Node {
    const item = this.generateUidIdentifier("item");
    const result = callExpression(this.getRuntimeHelper("$for"), [
      arrowFunctionExpression([], array),
      arrowFunctionExpression([item], cloneNode(item)),
    ]);
    this.generatedForExpressions.add(result);
    return result;
  }

  private createMapFor(expression: Node, allocator: IdentifierAllocator): Node {
    const callee = expression.callee;
    if (!isMemberExpression(callee))
      throw new Error("Vynn `$for` requires a `.map()` call.");
    const source = callee.object;
    const callback = expression.arguments[0];
    if (!isExpression(source))
      throw new Error("Vynn `$for` map source must be an expression.");
    if (!isExpression(callback))
      throw new Error("Vynn `$for` requires a map callback expression.");
    if (
      !isArrowFunctionExpression(callback) &&
      !isFunctionExpression(callback)
    ) {
      throw new Error("Vynn `$for` requires a function callback.");
    }

    const transformedSource = this.transformEmbeddedExpression(
      source,
      allocator,
    );
    const transformedCallback = this.withForCallback(callback.params, () => {
      if (isArrowFunctionExpression(callback)) {
        if (isBlockStatement(callback.body))
          callback.body = this.transformBlockStatement(
            callback.body,
            allocator,
          );
        else
          callback.body = this.transformEmbeddedExpression(
            callback.body,
            allocator,
          );
      } else {
        callback.body = this.transformBlockStatement(callback.body, allocator);
      }
      return callback;
    });

    const result = callExpression(this.getRuntimeHelper("$for"), [
      arrowFunctionExpression([], transformedSource),
      transformedCallback,
    ]);
    this.generatedForExpressions.add(result);
    return result;
  }

  private transformStatementContextExpression(
    expression: Node,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions = false,
  ): Node {
    if (isJSXElement(expression)) {
      if (isComponentElement(expression))
        return this.createComponentCall(expression, allocator);
      return this.createElementStatements(expression, statements, allocator);
    }
    if (isJSXFragment(expression)) {
      return this.createFragmentInStatements(
        expression,
        allocator,
        statements,
        dynamicExpressions,
      );
    }
    return this.transformEmbeddedExpression(expression, allocator);
  }

  private createFragmentInStatements(
    fragment: Node,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions = false,
  ): Node {
    const children = this.collectFragmentChildrenInStatements(
      fragment,
      allocator,
      statements,
      dynamicExpressions,
    );
    return children.length === 1 ? children[0] : arrayExpression(children);
  }

  private collectFragmentChildrenInStatements(
    fragment: Node,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions: boolean,
  ): Node[] {
    const children: Node[] = [];
    for (const child of fragment.children as Node[]) {
      if (isJSXFragment(child)) {
        children.push(
          ...this.collectFragmentChildrenInStatements(
            child,
            allocator,
            statements,
            dynamicExpressions,
          ),
        );
        continue;
      }
      const expression = this.transformFragmentChildInStatements(
        child,
        allocator,
        statements,
        dynamicExpressions,
      );
      if (expression) children.push(expression);
    }
    return children;
  }

  private transformFragmentChildInStatements(
    child: Node,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions = false,
  ): Node | null {
    if (isJSXElement(child)) {
      if (isComponentElement(child))
        return this.createComponentCall(child, allocator);
      return this.createElement(child, allocator);
    }
    if (isJSXText(child)) {
      const text = normalizeJSXText(child.value);
      return text ? this.createTextExpression(text) : null;
    }
    if (isJSXExpressionContainer(child)) {
      const expression = child.expression;
      if (isJSXEmptyExpression(expression)) return null;
      if (isExpression(expression)) {
        if (isStringLiteral(expression))
          return this.createTextExpression(expression.value);
        const transformed = this.transformEmbeddedExpression(
          expression,
          allocator,
        );
        if (dynamicExpressions && !this.isForExpression(transformed))
          return this.createDynamicExpression(transformed);
        return transformed;
      }
      return null;
    }
    if (isJSXFragment(child)) {
      return this.createFragmentInStatements(
        child,
        allocator,
        statements,
        dynamicExpressions,
      );
    }
    return null;
  }

  private createNestedFragment(
    fragment: Node,
    allocator: IdentifierAllocator,
    dynamicExpressions = false,
  ): Node {
    const children = this.collectFragmentChildrenForExpression(
      fragment,
      allocator,
      dynamicExpressions,
    );
    return children.length === 1 ? children[0] : arrayExpression(children);
  }

  private collectFragmentChildrenForExpression(
    fragment: Node,
    allocator: IdentifierAllocator,
    dynamicExpressions: boolean,
  ): Node[] {
    const children: Node[] = [];
    for (const child of fragment.children as Node[]) {
      if (isJSXFragment(child)) {
        children.push(
          ...this.collectFragmentChildrenForExpression(
            child,
            allocator,
            dynamicExpressions,
          ),
        );
        continue;
      }
      const expression = this.transformFragmentChildForExpression(
        child,
        allocator,
        dynamicExpressions,
      );
      if (expression) children.push(expression);
    }
    return children;
  }

  private transformFragmentChildForExpression(
    child: Node,
    allocator: IdentifierAllocator,
    dynamicExpressions = false,
  ): Node | null {
    if (isJSXElement(child)) {
      return isComponentElement(child)
        ? this.createComponentCall(child, allocator)
        : this.createElement(child, allocator);
    }
    if (isJSXText(child)) {
      const text = normalizeJSXText(child.value);
      return text ? this.createTextExpression(text) : null;
    }
    if (isJSXExpressionContainer(child)) {
      const expression = child.expression;
      if (isJSXEmptyExpression(expression)) return null;
      if (isExpression(expression)) {
        if (isStringLiteral(expression))
          return this.createTextExpression(expression.value);
        const transformed = this.transformEmbeddedExpression(
          expression,
          allocator,
        );
        if (dynamicExpressions && !this.isForExpression(transformed))
          return this.createDynamicExpression(transformed);
        return transformed;
      }
      return null;
    }
    if (isJSXFragment(child))
      return this.createNestedFragment(child, allocator, dynamicExpressions);
    return null;
  }

  private createElement(node: Node, allocator: IdentifierAllocator): Node {
    const statements: Node[] = [];
    const elementId = this.createElementStatements(node, statements, allocator);
    statements.push(returnStatement(elementId));
    return inheritSourceLocation(
      callExpression(
        arrowFunctionExpression([], blockStatement(statements)),
        [],
      ),
      node,
    );
  }

  private createElementStatements(
    node: Node,
    statements: Node[],
    allocator: IdentifierAllocator,
  ): Node {
    const tagName = getJSXIdentifierName(node.openingElement.name);
    const elementId = allocator.nextElement();
    statements.push(
      variableDeclaration("const", [
        variableDeclarator(
          elementId,
          callExpression(this.getRuntimeHelper("$tmpl"), [
            stringLiteral(tagName),
          ]),
        ),
      ]),
    );
    this.transformAttributes(
      node.openingElement,
      elementId,
      statements,
      allocator,
    );
    this.transformElementChildren(
      node.children,
      elementId,
      statements,
      allocator,
    );
    return elementId;
  }

  private transformElementChildren(
    children: Node[],
    elementId: Node,
    statements: Node[],
    allocator: IdentifierAllocator,
  ): void {
    for (const child of children) {
      if (isJSXText(child)) {
        const text = normalizeJSXText(child.value);
        if (text)
          statements.push(
            expressionStatement(
              this.createInsert(elementId, this.createTextExpression(text)),
            ),
          );
        continue;
      }
      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (isJSXEmptyExpression(expression) || !isExpression(expression))
          continue;
        const childExpression = isStringLiteral(expression)
          ? this.createTextExpression(expression.value)
          : this.transformEmbeddedExpression(expression, allocator);
        statements.push(
          expressionStatement(this.createInsert(elementId, childExpression)),
        );
        continue;
      }
      if (isJSXElement(child)) {
        const childExpression = isComponentElement(child)
          ? this.createComponentCall(child, allocator)
          : this.createElement(child, allocator);
        statements.push(
          expressionStatement(this.createInsert(elementId, childExpression)),
        );
        continue;
      }
      if (isJSXFragment(child)) {
        const fragment = this.createFragmentInStatements(
          child,
          allocator,
          statements,
          false,
        );
        statements.push(
          expressionStatement(this.createInsert(elementId, fragment)),
        );
      }
    }
  }

  private createDynamicExpression(expression: Node): Node {
    return callExpression(this.getRuntimeHelper("$dyn"), [
      arrowFunctionExpression([], expression),
    ]);
  }

  private createTextExpression(value: string): Node {
    return callExpression(this.getRuntimeHelper("$text"), [
      stringLiteral(value),
    ]);
  }

  private transformEmbeddedExpression(
    expression: Node,
    allocator: IdentifierAllocator,
  ): Node {
    if (!isNode(expression)) return expression;
    if (
      isCallExpression(expression) &&
      this.generatedForExpressions.has(expression)
    )
      return expression;
    if (
      isMemberExpression(expression) &&
      this.generatedForIndexReferences.has(expression)
    )
      return expression;

    const transformedForIndex = this.transformForIndexReference(expression);
    if (transformedForIndex !== expression) return transformedForIndex;

    if (isCallExpression(expression) && this.isJSXMapExpression(expression)) {
      return inheritSourceLocation(
        this.createMapFor(expression, allocator),
        expression,
      );
    }

    if (isArrayExpression(expression) && this.containsJSX(expression)) {
      expression.elements = expression.elements.map((element: Node | null) => {
        if (!element) return null;
        if (isSpreadElement(element)) {
          element.argument = this.transformEmbeddedExpression(
            element.argument,
            allocator,
          );
          return element;
        }
        return this.transformEmbeddedExpression(element, allocator);
      });
      return inheritSourceLocation(
        this.createArrayIdentityFor(expression),
        expression,
      );
    }

    if (isJSXElement(expression)) {
      const transformed = isComponentElement(expression)
        ? this.createComponentCall(expression, allocator)
        : this.createElement(expression, allocator);
      return inheritSourceLocation(transformed, expression);
    }

    if (isJSXFragment(expression)) {
      return inheritSourceLocation(
        this.createNestedFragment(expression, allocator, true),
        expression,
      );
    }

    if (isLogicalExpression(expression)) {
      expression.left = this.transformEmbeddedExpression(
        expression.left,
        allocator,
      );
      expression.right = this.transformEmbeddedExpression(
        expression.right,
        allocator,
      );
      return expression;
    }
    if (isConditionalExpression(expression)) {
      expression.test = this.transformEmbeddedExpression(
        expression.test,
        allocator,
      );
      expression.consequent = this.transformEmbeddedExpression(
        expression.consequent,
        allocator,
      );
      expression.alternate = this.transformEmbeddedExpression(
        expression.alternate,
        allocator,
      );
      return expression;
    }
    if (isCallExpression(expression)) {
      expression.arguments = expression.arguments.map((argument: Node) => {
        if (isSpreadElement(argument)) {
          argument.argument = this.transformEmbeddedExpression(
            argument.argument,
            allocator,
          );
          return argument;
        }
        return isExpression(argument)
          ? this.transformEmbeddedExpression(argument, allocator)
          : argument;
      });
      return expression;
    }
    if (isArrowFunctionExpression(expression)) {
      return this.withShadowedForIndices(expression.params, () => {
        if (isBlockStatement(expression.body))
          expression.body = this.transformBlockStatement(
            expression.body,
            allocator,
          );
        else
          expression.body = this.transformEmbeddedExpression(
            expression.body,
            allocator,
          );
        return expression;
      });
    }
    if (isFunctionExpression(expression)) {
      return this.withShadowedForIndices(expression.params, () => {
        expression.body = this.transformBlockStatement(
          expression.body,
          allocator,
        );
        return expression;
      });
    }
    if (isArrayExpression(expression)) {
      expression.elements = expression.elements.map((element: Node | null) => {
        if (!element) return null;
        if (isSpreadElement(element)) {
          element.argument = this.transformEmbeddedExpression(
            element.argument,
            allocator,
          );
          return element;
        }
        return this.transformEmbeddedExpression(element, allocator);
      });
      return expression;
    }
    if (isObjectExpression(expression)) {
      expression.properties = expression.properties.map((property: Node) => {
        if (isSpreadElement(property)) {
          property.argument = this.transformEmbeddedExpression(
            property.argument,
            allocator,
          );
          return property;
        }
        if (isObjectProperty(property)) {
          if (isExpression(property.value)) {
            const originalValue = property.value;
            const transformedValue = this.transformEmbeddedExpression(
              originalValue,
              allocator,
            );
            if (property.shorthand && transformedValue !== originalValue)
              property.shorthand = false;
            property.value = transformedValue;
          }
          return property;
        }
        if (isObjectMethod(property)) {
          property.value.body = this.withShadowedForIndices(
            property.value.params,
            () => this.transformBlockStatement(property.value.body, allocator),
          );
          return property;
        }
        return property;
      });
      return expression;
    }
    if (isSequenceExpression(expression)) {
      expression.expressions = expression.expressions.map((item: Node) =>
        this.transformEmbeddedExpression(item, allocator),
      );
      return expression;
    }
    if (isUnaryExpression(expression) || isAwaitExpression(expression)) {
      expression.argument = this.transformEmbeddedExpression(
        expression.argument,
        allocator,
      );
      return expression;
    }
    if (isUpdateExpression(expression)) return expression;
    if (isAssignmentExpression(expression)) {
      expression.right = this.transformEmbeddedExpression(
        expression.right,
        allocator,
      );
      return expression;
    }
    if (isBinaryExpression(expression)) {
      if (isExpression(expression.left))
        expression.left = this.transformEmbeddedExpression(
          expression.left,
          allocator,
        );
      if (isExpression(expression.right))
        expression.right = this.transformEmbeddedExpression(
          expression.right,
          allocator,
        );
      return expression;
    }
    if (isTemplateLiteral(expression)) {
      expression.expressions = expression.expressions.map((item: Node) =>
        this.transformEmbeddedExpression(item, allocator),
      );
      return expression;
    }
    if (isMemberExpression(expression)) {
      if (isExpression(expression.object))
        expression.object = this.transformEmbeddedExpression(
          expression.object,
          allocator,
        );
      if (expression.computed && isExpression(expression.property))
        expression.property = this.transformEmbeddedExpression(
          expression.property,
          allocator,
        );
      return expression;
    }
    // Oxc's ESTree AST represents optional chains as ChainExpression, unlike
    // Babel's OptionalMemberExpression / OptionalCallExpression nodes.
    if (isType(expression, "ChainExpression")) {
      expression.expression = this.transformEmbeddedExpression(
        expression.expression,
        allocator,
      );
      return expression;
    }
    if (
      isTSAsExpression(expression) ||
      isTSNonNullExpression(expression) ||
      isType(expression, "TSTypeAssertion")
    ) {
      expression.expression = this.transformEmbeddedExpression(
        expression.expression,
        allocator,
      );
      return expression;
    }
    return expression;
  }

  private transformBlockStatement(
    block: Node,
    allocator: IdentifierAllocator,
  ): Node {
    block.body = block.body.map((statement: Node) => {
      if (isReturnStatement(statement)) {
        if (statement.argument && isExpression(statement.argument))
          statement.argument = this.transformEmbeddedExpression(
            statement.argument,
            allocator,
          );
        return statement;
      }
      if (isExpressionStatement(statement)) {
        statement.expression = this.transformEmbeddedExpression(
          statement.expression,
          allocator,
        );
        return statement;
      }
      if (isVariableDeclaration(statement)) {
        for (const declaration of statement.declarations as Node[]) {
          if (
            isArrowComponentDeclaration(declaration) &&
            this.transformArrowComponent(declaration)
          )
            continue;
          if (!declaration.init || !isExpression(declaration.init)) continue;
          this.assertJSXInitializerIsLazy(declaration);
          declaration.init = this.transformEmbeddedExpression(
            declaration.init,
            allocator,
          );
        }
        return statement;
      }
      if (isIfStatement(statement)) {
        statement.test = this.transformEmbeddedExpression(
          statement.test,
          allocator,
        );
        if (isBlockStatement(statement.consequent))
          statement.consequent = this.transformBlockStatement(
            statement.consequent,
            allocator,
          );
        else
          statement.consequent = this.transformStatement(
            statement.consequent,
            allocator,
          );
        if (statement.alternate) {
          statement.alternate = isBlockStatement(statement.alternate)
            ? this.transformBlockStatement(statement.alternate, allocator)
            : this.transformStatement(statement.alternate, allocator);
        }
        return statement;
      }
      if (
        isFunctionDeclaration(statement) &&
        statement.id &&
        isComponentName(statement.id.name)
      ) {
        const transformed = this.transformComponentDeclaration(statement);
        if (transformed !== statement) return transformed;
      }
      return this.visitNestedDeclarations(statement);
    });
    return block;
  }

  private transformStatement(
    statement: Node,
    allocator: IdentifierAllocator,
  ): Node {
    if (isVariableDeclaration(statement)) {
      for (const declaration of statement.declarations as Node[]) {
        if (
          isArrowComponentDeclaration(declaration) &&
          this.transformArrowComponent(declaration)
        )
          continue;
        if (!declaration.init || !isExpression(declaration.init)) continue;
        this.assertJSXInitializerIsLazy(declaration);
        declaration.init = this.transformEmbeddedExpression(
          declaration.init,
          allocator,
        );
      }
      return statement;
    }
    if (isExpressionStatement(statement)) {
      statement.expression = this.transformEmbeddedExpression(
        statement.expression,
        allocator,
      );
      return statement;
    }
    if (isBlockStatement(statement))
      return this.transformBlockStatement(statement, allocator);
    if (isIfStatement(statement)) {
      statement.test = this.transformEmbeddedExpression(
        statement.test,
        allocator,
      );
      statement.consequent = isBlockStatement(statement.consequent)
        ? this.transformBlockStatement(statement.consequent, allocator)
        : this.transformStatement(statement.consequent, allocator);
      if (statement.alternate) {
        statement.alternate = isBlockStatement(statement.alternate)
          ? this.transformBlockStatement(statement.alternate, allocator)
          : this.transformStatement(statement.alternate, allocator);
      }
      return statement;
    }
    if (
      isFunctionDeclaration(statement) &&
      statement.id &&
      isComponentName(statement.id.name)
    ) {
      const transformed = this.transformComponentDeclaration(statement);
      if (transformed !== statement) return transformed;
    }
    return this.visitNestedDeclarations(statement);
  }

  private containsEagerJSX(node: Node | null | undefined): boolean {
    if (!node) return false;
    if (isJSXElement(node) || isJSXFragment(node)) return true;
    if (
      isFunctionLike(node) ||
      isObjectMethod(node) ||
      isType(node, "ObjectMethod") ||
      isType(node, "MethodDefinition")
    )
      return false;
    for (const key of getVisitorKeys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value)
          if (isNode(child) && this.containsEagerJSX(child)) return true;
      } else if (isNode(value) && this.containsEagerJSX(value)) return true;
    }
    return false;
  }

  private assertJSXInitializerIsLazy(declaration: Node): void {
    const initializer = declaration.init;
    if (!initializer || !this.containsEagerJSX(initializer)) return;
    const variableName = isIdentifier(declaration.id)
      ? `"${declaration.id.name}"`
      : "this variable";
    const message =
      `JSX in the initializer for ${variableName} must be wrapped in a function ` +
      "to preserve SSR hydration order. For example: const view = () => (<>...</>);";
    const location = declaration.loc?.start;
    const suffix = location
      ? ` (line ${location.line}, column ${location.column + 1})`
      : "";
    throw new Error(`${message}${suffix} in ${this.filename}`);
  }

  private createComponentCall(
    node: Node,
    allocator: IdentifierAllocator,
  ): Node {
    const componentExpression = this.createComponentExpression(
      node.openingElement.name,
    );
    const props = this.createComponentProps(node, allocator);
    return callExpression(componentExpression, props ? [props] : []);
  }

  private createComponentExpression(name: Node): Node {
    if (isJSXIdentifier(name)) return identifier(name.name);
    if (isJSXMemberExpression(name)) {
      return memberExpression(
        this.createComponentExpression(name.object),
        identifier(name.property.name),
      );
    }
    throw new Error(
      "Vynn currently only supports simple or member-expression components.",
    );
  }

  private createComponentProps(
    node: Node,
    allocator: IdentifierAllocator,
  ): Node | null {
    const properties: Node[] = [];
    for (const attribute of node.openingElement.attributes as Node[]) {
      if (isJSXSpreadAttribute(attribute)) {
        properties.push(
          spreadElement(
            this.transformEmbeddedExpression(attribute.argument, allocator),
          ),
        );
        continue;
      }
      if (!isJSXAttribute(attribute) || !isJSXIdentifier(attribute.name))
        continue;
      const name = attribute.name.name;

      if (name === "ref") {
        const value = attribute.value;
        if (
          !isJSXExpressionContainer(value) ||
          isJSXEmptyExpression(value.expression) ||
          !isExpression(value.expression)
        )
          continue;
        properties.push(this.createComponentRef(value.expression));
        continue;
      }
      if (isLiteralString(attribute.value)) {
        properties.push(
          objectMethod(
            "get",
            propertyKey(name),
            [],
            blockStatement([
              returnStatement(stringLiteral(attribute.value.value)),
            ]),
          ),
        );
        continue;
      }
      if (isJSXExpressionContainer(attribute.value)) {
        const expression = attribute.value.expression;
        if (!isJSXEmptyExpression(expression) && isExpression(expression)) {
          properties.push(
            objectMethod(
              "get",
              propertyKey(name),
              [],
              this.createComponentGetterBody(expression, allocator, node),
            ),
          );
        }
        continue;
      }
      if (attribute.value === null) {
        properties.push(
          objectMethod(
            "get",
            propertyKey(name),
            [],
            blockStatement([returnStatement(booleanLiteral(true))]),
          ),
        );
      }
    }

    const children = this.createComponentChildrenGetterBody(node, allocator);
    if (children)
      properties.push(
        objectMethod("get", identifier("children"), [], children),
      );
    return properties.length ? objectExpression(properties) : null;
  }

  private createComponentRef(expression: Node): Node {
    const refParameter = identifier("r$");
    const statements: Node[] = [];
    if (isIdentifier(expression)) {
      const refIdentifier = this.generateUidIdentifier("ref");
      statements.push(
        variableDeclaration("const", [
          variableDeclarator(refIdentifier, cloneNode(expression)),
        ]),
      );
      statements.push(
        expressionStatement(
          conditionalExpression(
            binaryExpression(
              "===",
              unaryExpression("typeof", cloneNode(refIdentifier)),
              stringLiteral("function"),
            ),
            callExpression(cloneNode(refIdentifier), [cloneNode(refParameter)]),
            assignmentExpression(
              "=",
              cloneNode(expression),
              cloneNode(refParameter),
            ),
          ),
        ),
      );
      return objectMethod(
        "method",
        identifier("ref"),
        [refParameter],
        blockStatement(statements),
      );
    }
    const refIdentifier = this.generateUidIdentifier("ref");
    statements.push(
      variableDeclaration("const", [
        variableDeclarator(refIdentifier, expression),
      ]),
    );
    statements.push(
      expressionStatement(
        conditionalExpression(
          binaryExpression(
            "===",
            unaryExpression("typeof", cloneNode(refIdentifier)),
            stringLiteral("function"),
          ),
          callExpression(cloneNode(refIdentifier), [cloneNode(refParameter)]),
          voidZero(),
        ),
      ),
    );
    return objectMethod(
      "method",
      identifier("ref"),
      [refParameter],
      blockStatement(statements),
    );
  }

  private createComponentGetterBody(
    expression: Node,
    allocator: IdentifierAllocator,
    _componentNode: Node,
  ): Node {
    const statements: Node[] = [];
    const transformed = this.transformStatementContextExpression(
      expression,
      allocator,
      statements,
      isJSXFragment(expression),
    );
    statements.push(returnStatement(transformed));
    return blockStatement(statements);
  }

  private createComponentChildrenGetterBody(
    node: Node,
    allocator: IdentifierAllocator,
  ): Node | null {
    const children: Node[] = [];
    const statements: Node[] = [];
    for (const child of node.children as Node[]) {
      if (isJSXText(child)) {
        const text = normalizeJSXText(child.value);
        if (text) children.push(this.createTextExpression(text));
        continue;
      }
      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (isJSXEmptyExpression(expression)) continue;
        if (isExpression(expression)) {
          if (isStringLiteral(expression)) {
            children.push(this.createTextExpression(expression.value));
            continue;
          }
          const transformed = this.transformEmbeddedExpression(
            expression,
            allocator,
          );
          children.push(
            this.isForExpression(transformed)
              ? transformed
              : this.createDynamicExpression(transformed),
          );
        }
        continue;
      }
      if (isJSXElement(child)) {
        children.push(
          isComponentElement(child)
            ? this.createComponentCall(child, allocator)
            : this.createElement(child, allocator),
        );
        continue;
      }
      if (isJSXFragment(child)) {
        children.push(
          this.createFragmentInStatements(child, allocator, statements, true),
        );
      }
    }
    if (children.length === 0) return null;
    const result =
      children.length === 1 ? children[0] : arrayExpression(children);
    statements.push(returnStatement(result));
    return blockStatement(statements);
  }

  private transformAttributes(
    opening: Node,
    elementId: Node,
    statements: Node[],
    allocator: IdentifierAllocator,
  ): void {
    for (const attribute of opening.attributes as Node[]) {
      if (isJSXSpreadAttribute(attribute)) {
        statements.push(
          expressionStatement(
            this.createSpreadAttribute(
              elementId,
              this.transformEmbeddedExpression(attribute.argument, allocator),
            ),
          ),
        );
        continue;
      }
      if (!isJSXAttribute(attribute) || !isJSXIdentifier(attribute.name))
        continue;
      const name = attribute.name.name;

      if (name === "ref") {
        const value = attribute.value;
        if (
          !isJSXExpressionContainer(value) ||
          isJSXEmptyExpression(value.expression) ||
          !isExpression(value.expression)
        )
          continue;
        statements.push(...this.createRef(elementId, value.expression));
        continue;
      }
      if (this.isEventAttribute(name)) {
        const value = attribute.value;
        if (!isJSXExpressionContainer(value) || !isExpression(value.expression))
          continue;
        statements.push(
          expressionStatement(
            this.createEvent(
              elementId,
              name.slice(2).toLowerCase(),
              this.transformEmbeddedExpression(value.expression, allocator),
            ),
          ),
        );
        continue;
      }
      if (isJSXExpressionContainer(attribute.value)) {
        const expression = attribute.value.expression;
        if (isJSXEmptyExpression(expression) || !isExpression(expression))
          continue;
        statements.push(
          expressionStatement(
            this.createAttribute(
              elementId,
              name,
              this.transformEmbeddedExpression(expression, allocator),
            ),
          ),
        );
        continue;
      }
      if (isLiteralString(attribute.value)) {
        statements.push(
          expressionStatement(
            this.createStaticAttribute(elementId, name, attribute.value),
          ),
        );
        continue;
      }
      if (attribute.value === null) {
        statements.push(
          expressionStatement(
            this.createStaticAttribute(elementId, name, booleanLiteral(true)),
          ),
        );
      }
    }
  }

  private createRef(elementId: Node, expression: Node): Node[] {
    if (isIdentifier(expression)) {
      return [
        expressionStatement(
          conditionalExpression(
            binaryExpression(
              "===",
              unaryExpression("typeof", cloneNode(expression)),
              stringLiteral("function"),
            ),
            callExpression(cloneNode(expression), [cloneNode(elementId)]),
            assignmentExpression(
              "=",
              cloneNode(expression),
              cloneNode(elementId),
            ),
          ),
        ),
      ];
    }
    if (
      isArrowFunctionExpression(expression) ||
      isFunctionExpression(expression)
    ) {
      return [
        expressionStatement(callExpression(expression, [cloneNode(elementId)])),
      ];
    }
    const refIdentifier = this.generateUidIdentifier("ref");
    return [
      variableDeclaration("const", [
        variableDeclarator(refIdentifier, expression),
      ]),
      expressionStatement(
        conditionalExpression(
          binaryExpression(
            "===",
            unaryExpression("typeof", cloneNode(refIdentifier)),
            stringLiteral("function"),
          ),
          callExpression(cloneNode(refIdentifier), [cloneNode(elementId)]),
          voidZero(),
        ),
      ),
    ];
  }

  private createSpreadAttribute(elementId: Node, expression: Node): Node {
    return callExpression(this.getRuntimeHelper("$spread"), [
      elementId,
      arrowFunctionExpression([], expression),
    ]);
  }

  private createAttribute(
    elementId: Node,
    name: string,
    expression: Node,
  ): Node {
    return callExpression(this.getRuntimeHelper("$attr"), [
      elementId,
      stringLiteral(name),
      arrowFunctionExpression([], expression),
    ]);
  }

  private createStaticAttribute(
    elementId: Node,
    name: string,
    value: Node,
  ): Node {
    return callExpression(this.getRuntimeHelper("$attr"), [
      elementId,
      stringLiteral(name),
      value,
    ]);
  }

  private createEvent(elementId: Node, event: string, expression: Node): Node {
    return callExpression(this.getRuntimeHelper("$on"), [
      elementId,
      stringLiteral(event),
      expression,
    ]);
  }

  private isEventAttribute(name: string): boolean {
    return (
      name.length > 2 &&
      name.startsWith("on") &&
      name[2] === name[2].toUpperCase()
    );
  }

  private createInsert(elementId: Node, expression: Node): Node {
    let child: Node;
    if (
      isLiteralString(expression) ||
      isNumericLiteral(expression) ||
      this.isForExpression(expression) ||
      this.isTextExpression(expression)
    ) {
      child = expression;
    } else if (
      isCallExpression(expression) &&
      expression.arguments.length === 0 &&
      isArrowFunctionExpression(expression.callee)
    ) {
      child = expression.callee;
    } else {
      child = arrowFunctionExpression([], expression);
    }
    return callExpression(this.getRuntimeHelper("$insert"), [elementId, child]);
  }
}

/**
 * Vite integration. Oxc parses the source; Vynn performs its own JSX lowering.
 * The standard Oxc JSX transform must not run afterward on the same source.
 */
export function vynnOxcPlugin(options: ReactivePluginOptions = {}): Plugin {
  return {
    name: "vynn-oxc-jsx",
    enforce: "pre",
    transform(source, id) {
      if (options.enabled === false) return null;
      if (id.includes("node_modules") || id.startsWith("\0")) return null;
      const cleanId = id.split("?", 1)[0];
      if (!/\.(?:[cm]?[jt]sx?)$/i.test(cleanId)) return null;
      if (!/[<(]/.test(source) || !source.includes("<")) return null;
      return compileVynnOxc(source, cleanId, options);
    },
  };
}
