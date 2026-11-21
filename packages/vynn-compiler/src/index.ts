/**
 * Build-tool-independent Vynn JSX compiler powered by Oxc and esrap.
 *
 * The compiler parses source, lowers Vynn JSX semantics, and prints the
 * transformed module. Build tools should integrate this package through
 * their own adapters.
 */

import { print } from "esrap";
import tsx from "esrap/languages/tsx";
import { parseSync } from "oxc-parser";

import type { ExpressionNode, Node, NodeOfType } from "./ast.ts";

import {
  addSourceLocations,
  arrayExpression,
  arrowFunctionExpression,
  assignmentExpression,
  binaryExpression,
  blockStatement,
  booleanLiteral,
  callExpression,
  cloneNode,
  conditionalExpression,
  createPositionLookup,
  expressionStatement,
  forEachChild,
  functionExpression,
  generatedNode,
  getJSXAttributeName,
  getJSXIdentifierName,
  getNodeProperty,
  getVisitorKeys,
  identifier,
  importDeclaration,
  importSpecifier,
  inferLang,
  inheritSourceLocation,
  isArrayExpression,
  isArrayPattern,
  isComponentFunctionDeclaration,
  isArrowFunctionExpression,
  isAssignmentExpression,
  isAssignmentPattern,
  isAwaitExpression,
  isBinaryExpression,
  isBlockStatement,
  isCallExpression,
  isComponentElement,
  isComponentName,
  isConditionalExpression,
  isExpression,
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionLike,
  isIdentifier,
  isIfStatement,
  isImportDeclaration,
  isImportSpecifier,
  isJSXAttribute,
  isJSXElement,
  isJSXEmptyExpression,
  isJSXExpressionContainer,
  isJSXFragment,
  isJSXIdentifier,
  isJSXMemberExpression,
  isJSXSpreadAttribute,
  isJSXText,
  isLiteralString,
  isLogicalExpression,
  isMemberExpression,
  isNode,
  isNodeArray,
  isNumericLiteral,
  isObjectExpression,
  isObjectMethod,
  isObjectPattern,
  isObjectProperty,
  isRestElement,
  isReturnStatement,
  isSequenceExpression,
  isSpreadElement,
  isStringLiteral,
  isTSAsExpression,
  isTSNonNullExpression,
  isTemplateLiteral,
  isType,
  isUnaryExpression,
  isUpdateExpression,
  isVariableDeclaration,
  memberExpression,
  normalizeJSXText,
  objectExpression,
  objectMethod,
  objectProperty,
  programContainsJSX,
  propertyKey,
  returnStatement,
  setNodeProperty,
  spreadElement,
  stringLiteral,
  unaryExpression,
  variableDeclaration,
  variableDeclarator,
  voidZero,
} from "./ast.ts";

type RuntimeHelperName =
  | "$nodes"
  | "$text"
  | "$template"
  | "$child"
  | "$sibling"
  | "$finishTemplate"
  | "$cmpnt"
  | "$insert"
  | "$attr"
  | "$on"
  | "$spread"
  | "$for"
  | "$if"
  | "$cache"
  | "$registerHead"
  | "$registerHeadGroup";

export type VynnCompilerOptions = {
  /** Override parser language. Usually inferred from the file extension. */
  lang?: "js" | "jsx" | "ts" | "tsx";
  /** Source module type; Vynn modules are normally ESM. */
  sourceType?: "module" | "script" | "unambiguous";
};

type ComponentPropAccessStep = {
  key: Node;
  computed: boolean;
  fallback?: Node;
};

type IdentifierAllocator = {
  nextElement(): NodeOfType<"Identifier">;
};

type TemplateNodeShape =
  | {
      kind: "element";
      tag: string;
      attributes: Array<[string, string]>;
      children: TemplateNodeShape[];
    }
  | { kind: "text"; value: string }
  | { kind: "anchor"; id: string };

type TemplateBinding = {
  kind: "attribute" | "spread" | "child" | "title";
  path: number[];
  node: Node;
  slot?: string;
};

const runtimeImportSource = "vynn/render";

export type VynnSourceMap = {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: Array<string | null>;
  names: string[];
  mappings: string;
  [key: string]: unknown;
};

export type VynnTransformResult = {
  code: string;
  map: VynnSourceMap | null;
};

/** Transform source and return the generated code. */
export function transformVynnOxc(
  source: string,
  filename = "module.tsx",
  options: VynnCompilerOptions = {},
): string {
  return transformVynnOxcWithMap(source, filename, options).code;
}

/** Transform source and return the generated code and source map. */
export function transformVynnOxcWithMap(
  source: string,
  filename = "module.tsx",
  options: VynnCompilerOptions = {},
): VynnTransformResult {
  return compileVynnOxc(source, filename, options);
}

function compileVynnOxc(
  source: string,
  filename: string,
  options: VynnCompilerOptions = {},
): VynnTransformResult {
  const lang = options.lang ?? inferLang(filename);
  const parsed = parseSync(filename, source, {
    lang,
    sourceType: options.sourceType ?? "module",
    astType: "ts",
    preserveParens: false,
    showSemanticErrors: false,
  });

  const fatal = parsed.errors.filter((error) => error.severity === "Error");
  if (fatal.length > 0) {
    const messages = fatal.map((error) => error.message).join("\n");
    throw new Error(`Oxc failed to parse ${filename}:\n${messages}`);
  }

  // Oxc's public native AST types differ from the ESTree-shaped result
  // consumed by this transformer. Keep the bridge explicit and typed.
  const program = parsed.program as unknown as Node;
  if (!isType(program, "Program")) {
    throw new Error(`Oxc returned an invalid program for ${filename}.`);
  }
  const containsJSX = programContainsJSX(program);
  if (!containsJSX && !source.includes("$state")) return { code: source, map: null };

  addSourceLocations(program, source);
  const state = new TransformState(program, filename);
  const transformedStateValues = state.transformDirectStateValues();

  if (!containsJSX && !transformedStateValues) {
    return { code: source, map: null };
  }

  if (containsJSX) state.transformProgram();

  // Oxc exposes comment spans as offsets. esrap accepts ESTree-style comment
  // locations, so convert them before printing to keep ordinary JS/TS comments.
  const positionAt = createPositionLookup(source);
  const comments = parsed.comments.map((comment) => ({
    type: comment.type,
    value: comment.value,
    loc: {
      start: positionAt(comment.start),
      end: positionAt(comment.end),
    },
  }));
  const output = print(program, tsx({ comments }), {
    sourceMapSource: filename,
    sourceMapContent: source,
  });
  // esrap currently exposes its generated map as `unknown`. The generated
  // object follows the standard source-map shape consumed by build tools.
  const map = output.map as VynnSourceMap | undefined;
  return { code: output.code, map: map ?? null };
}

class TransformState {
  private readonly program: NodeOfType<"Program">;
  private readonly filename: string;
  private readonly runtimeHelpers = new Map<RuntimeHelperName, NodeOfType<"Identifier">>();
  private readonly templateStatements: Node[] = [];
  private readonly templateFactories = new Map<string, NodeOfType<"Identifier">>();
  private readonly generatedForExpressions = new WeakSet<object>();
  private readonly generatedIfExpressions = new WeakSet<object>();
  private readonly generatedForIndexReferences = new WeakSet<object>();
  /**
   * Named .map() calls that must use a callback variant with a reactive index.
   */
  private readonly namedMapCallbacks = new WeakMap<object, Node>();
  /** Function nodes cloned specifically for a named Vynn list callback. */
  private readonly specializedForCallbacks = new WeakSet<object>();
  private activeForIndexNames: string[] = [];
  private readonly usedNames = new Set<string>();
  private readonly svgDescendants = new WeakSet<object>();
  private readonly documentHeadNodes = new WeakSet<object>();
  private readonly documentHeadContentNodes = new WeakSet<object>();

  constructor(program: NodeOfType<"Program">, filename: string) {
    this.program = program;
    this.filename = filename;
    this.collectUsedNames(program);
    this.collectSvgDescendants(program, false);
    this.collectDocumentHeadNodes(program);
  }

  private collectSvgDescendants(node: Node, insideSvg: boolean): void {
    let childrenInsideSvg = insideSvg;

    if (isJSXElement(node)) {
      const tagName = isJSXIdentifier(node.openingElement.name)
        ? node.openingElement.name.name.toLowerCase()
        : "";
      const isSvgElement = insideSvg || tagName === "svg";

      if (isSvgElement) this.svgDescendants.add(node);

      // foreignObject itself is SVG, but its descendants use the HTML namespace.
      childrenInsideSvg = isSvgElement && tagName !== "foreignobject";
    }

    forEachChild(node, (child) => this.collectSvgDescendants(child, childrenInsideSvg));
  }

  private collectDocumentHeadNodes(
    node: Node,
    parentTag: string | null = null,
    insideDocumentHead = false,
  ): void {
    if (isJSXElement(node)) {
      const tagName = getJSXIdentifierName(node.openingElement.name).toLowerCase();
      const isDocumentHead = tagName === "head" && parentTag === "html";
      const insideHead = insideDocumentHead || isDocumentHead;

      if (isDocumentHead) this.documentHeadNodes.add(node);
      if (insideHead) this.documentHeadContentNodes.add(node);

      forEachChild(node, (child) =>
        this.collectDocumentHeadNodes(child, tagName, insideHead),
      );
      return;
    }

    forEachChild(node, (child) =>
      this.collectDocumentHeadNodes(child, parentTag, insideDocumentHead),
    );
  }

  private isHeadGroupElement(node: NodeOfType<"JSXElement">): boolean {
    return (
      getJSXIdentifierName(node.openingElement.name).toLowerCase() === "head" &&
      !this.documentHeadNodes.has(node)
    );
  }

  private isHoistableHeadElement(node: NodeOfType<"JSXElement">, tagName: string): boolean {
    if (tagName !== "title" && tagName !== "meta" && tagName !== "link") {
      return false;
    }

    if (this.svgDescendants.has(node) || this.documentHeadContentNodes.has(node)) return false;

    // Metadata inside an authored document <head> stays in that document
    // template. Metadata outside it is still placed in the active document head.
    // React keeps microdata metadata in its local DOM position.
    return !node.openingElement.attributes.some(
      (attribute: Node) =>
        isJSXAttribute(attribute) &&
        getJSXAttributeName(attribute.name).toLowerCase() === "itemprop",
    );
  }

  private collectUsedNames(node: Node): void {
    if (isIdentifier(node)) this.usedNames.add(node.name);
    forEachChild(node, (child) => this.collectUsedNames(child));
  }

  private generateUidIdentifier(hint: string, prefix = "_"): NodeOfType<"Identifier"> {
    const cleanHint = hint.replace(/^\$+/, "").replace(/[^A-Za-z0-9_$]/g, "") || "ref";
    const base = `${prefix}${cleanHint}`;
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

  private findExistingRuntimeImport(name: RuntimeHelperName): NodeOfType<"Identifier"> | null {
    for (const statement of this.program.body) {
      if (!isImportDeclaration(statement) || statement.source?.value !== runtimeImportSource)
        continue;
      for (const specifier of statement.specifiers ?? []) {
        if (!isImportSpecifier(specifier)) continue;
        const importedName = isIdentifier(specifier.imported)
          ? specifier.imported.name
          : isLiteralString(specifier.imported)
            ? specifier.imported.value
            : null;
        if (importedName === name) return specifier.local;
      }
    }
    return null;
  }

  private getRuntimeHelper(name: RuntimeHelperName): NodeOfType<"Identifier"> {
    const existing = this.runtimeHelpers.get(name);
    if (existing) return existing;

    const imported = this.findExistingRuntimeImport(name);
    if (imported) {
      this.runtimeHelpers.set(name, imported);
      return imported;
    }

    const local = this.generateUidIdentifier(name, "_$");
    this.runtimeHelpers.set(name, local);
    return local;
  }

  private injectRuntimeImports(): void {
    if (this.runtimeHelpers.size === 0) return;

    let existingImport: NodeOfType<"ImportDeclaration"> | undefined;
    for (const statement of this.program.body) {
      if (isImportDeclaration(statement) && statement.source?.value === runtimeImportSource) {
        existingImport = statement;
        break;
      }
    }

    if (existingImport) {
      for (const [name, local] of this.runtimeHelpers) {
        const alreadyImported = (existingImport.specifiers ?? []).some((specifier: Node) => {
          if (!isImportSpecifier(specifier)) return false;
          const importedName = isIdentifier(specifier.imported)
            ? specifier.imported.name
            : isLiteralString(specifier.imported)
              ? specifier.imported.value
              : null;
          return importedName === name && specifier.local?.name === local.name;
        });
        if (!alreadyImported) {
          existingImport.specifiers.push(importSpecifier(cloneNode(local), identifier(name)));
        }
      }
      return;
    }

    const specifiers = [...this.runtimeHelpers].map(([name, local]) =>
      importSpecifier(cloneNode(local), identifier(name)),
    );
    setNodeProperty(this.program, "body", [
      importDeclaration(specifiers, runtimeImportSource),
      ...this.program.body,
    ]);
  }

  transformDirectStateValues(): boolean {
    const stateBindings = new Set<string>();
    const namespaceBindings = new Set<string>();

    for (const statement of this.program.body) {
      if (!isImportDeclaration(statement)) continue;

      const source = getNodeProperty(statement, "source");
      const sourceName = isLiteralString(source) ? source.value : "";
      if (getNodeProperty(statement, "importKind") === "type") continue;

      if (sourceName === "vynn") {
        for (const specifier of statement.specifiers ?? []) {
          if (getNodeProperty(specifier, "importKind") === "type") continue;

          const local = getNodeProperty(specifier, "local");
          if (!isIdentifier(local)) continue;

          if (isImportSpecifier(specifier)) {
            const imported = getNodeProperty(specifier, "imported");
            const importedName = isIdentifier(imported)
              ? imported.name
              : isLiteralString(imported)
                ? imported.value
                : null;
            if (importedName === "$state") stateBindings.add(local.name);
          } else if (isType(specifier, "ImportNamespaceSpecifier")) {
            namespaceBindings.add(local.name);
          }
        }
      }
    }

    if (stateBindings.size === 0 && namespaceBindings.size === 0) return false;

    const isStaticValue = (node: Node | null | undefined): boolean => {
      if (!node) return false;
      if (
        isType(node, "Literal") ||
        isArrayExpression(node) ||
        isObjectExpression(node) ||
        isTemplateLiteral(node) ||
        isJSXElement(node) ||
        isJSXFragment(node)
      ) {
        return true;
      }

      if (
        isTSAsExpression(node) ||
        isTSNonNullExpression(node) ||
        isType(node, "TSSatisfiesExpression") ||
        isType(node, "TSTypeAssertion")
      ) {
        const expression = getNodeProperty(node, "expression");
        return isNode(expression) && isStaticValue(expression);
      }

      if (isUnaryExpression(node)) {
        const operator = getNodeProperty(node, "operator");
        return ["!", "+", "-", "~", "typeof", "void"].includes(String(operator));
      }

      return false;
    };

    const matchesStateCall = (callee: Node): boolean => {
      if (isIdentifier(callee)) return stateBindings.has(callee.name);
      if (!isMemberExpression(callee) || callee.optional) return false;

      const object = callee.object;
      if (!isIdentifier(object) || !namespaceBindings.has(object.name)) return false;

      if (!callee.computed && isIdentifier(callee.property)) {
        return callee.property.name === "$state";
      }

      return (
        callee.computed &&
        isLiteralString(callee.property) &&
        callee.property.value === "$state"
      );
    };

    const directStateCalls: Node[] = [];
    const visit = (node: Node, shadowed: ReadonlySet<string>): void => {
      if (!isNode(node)) return;

      if (isFunctionLike(node)) {
        const local = new Set(shadowed);
        if (node.id && isIdentifier(node.id)) local.add(node.id.name);
        for (const parameter of node.params ?? []) {
          this.collectBindingNames(parameter, local);
        }

        if (isBlockStatement(node.body)) {
          this.collectDirectBlockBindings(node.body, local);
          this.collectFunctionVarBindings(node.body, local);
          visit(node.body, local);
        } else if (isNode(node.body)) {
          visit(node.body, local);
        }

        for (const parameter of node.params ?? []) visit(parameter, local);
        return;
      }

      if (isBlockStatement(node)) {
        const local = new Set(shadowed);
        this.collectDirectBlockBindings(node, local);
        for (const statement of node.body) visit(statement, local);
        return;
      }

      if (isType(node, "ClassDeclaration") || isType(node, "ClassExpression")) {
        const local = new Set(shadowed);
        if (node.id && isIdentifier(node.id)) local.add(node.id.name);
        forEachChild(node, (child) => visit(child, local));
        return;
      }

      if (isType(node, "CatchClause")) {
        const local = new Set(shadowed);
        if (node.param) this.collectBindingNames(node.param, local);
        if (isNode(node.body)) visit(node.body, local);
        return;
      }

      if (isType(node, "SwitchStatement")) {
        const local = new Set(shadowed);
        this.collectSwitchBindings(node, local);
        forEachChild(node, (child) => visit(child, local));
        return;
      }

      if (
        isType(node, "ForStatement") ||
        isType(node, "ForInStatement") ||
        isType(node, "ForOfStatement")
      ) {
        const local = new Set(shadowed);
        const binding = getNodeProperty(node, "init") ?? getNodeProperty(node, "left");
        if (isVariableDeclaration(binding) && binding.kind !== "var") {
          for (const declaration of binding.declarations) {
            this.collectBindingNames(declaration.id, local);
          }
        }

        for (const key of getVisitorKeys(node)) {
          const value = getNodeProperty(node, key);
          if (isNodeArray(value)) {
            for (const child of value) if (child) visit(child, local);
          } else if (isNode(value)) {
            visit(value, local);
          }
        }
        return;
      }

      if (isCallExpression(node) && !node.optional) {
        const args = node.arguments ?? [];
        if (args.length === 1 && isStaticValue(args[0]) && matchesStateCall(node.callee)) {
          const bindingName = isIdentifier(node.callee)
            ? node.callee.name
            : isMemberExpression(node.callee) && isIdentifier(node.callee.object)
              ? node.callee.object.name
              : "";
          if (!shadowed.has(bindingName)) {
            directStateCalls.push(node);
          }
        }
      }

      forEachChild(node, (child) => visit(child, shadowed));
    };

    visit(this.program, new Set());
    if (directStateCalls.length === 0) return false;

    const stateValueLocal = this.generateUidIdentifier("$stateValue", "_$").name;
    for (const call of directStateCalls) {
      setNodeProperty(call, "callee", identifier(stateValueLocal));
    }

    const stateValueImport = importDeclaration(
      [importSpecifier(identifier(stateValueLocal), identifier("$stateValue"))],
      "vynn/internal/state-value",
    );
    let insertionIndex = 0;

    while (insertionIndex < this.program.body.length) {
      const statement = this.program.body[insertionIndex]!;
      const isDirective =
        isExpressionStatement(statement) &&
        isType(statement.expression, "Literal") &&
        typeof statement.expression.value === "string";
      if (!isImportDeclaration(statement) && !isDirective) break;
      insertionIndex++;
    }

    const body = [...this.program.body];
    body.splice(insertionIndex, 0, stateValueImport);
    setNodeProperty(this.program, "body", body);

    return true;
  }

  transformProgram(): void {
    // Resolve named JSX-producing map callbacks before lowering mutates the AST.
    this.prepareNamedMapCallbacks();

    const transformedBody = this.program.body.flatMap((statement) => {
      const transformed = this.transformTopLevelStatement(statement);
      return Array.isArray(transformed) ? transformed : [transformed];
    });

    // Initialize module-scoped template factories before user code can invoke
    // components during module evaluation.
    setNodeProperty(this.program, "body", [
      ...this.templateStatements,
      ...transformedBody,
    ]);
    this.injectRuntimeImports();
  }

  /**
   * Resolve local named callbacks passed to JSX-producing .map() calls.
   *
   * Example:
   *   function renderItem(item, index) {
   *     return <span>{index}</span>;
   *   }
   *   items.map(renderItem)
   *
   * The original callback keeps ordinary JavaScript semantics. A cloned
   * variant is inserted next to its declaration, and only the relevant list
   * expression points to that variant. The clone is later compiled with
   * withForCallback(), so references to its second parameter read .value.
   *
   * Resolution follows lexical scopes and stops when a parameter, import, or
   * other local binding shadows a candidate function. This pass intentionally
   * specializes local function declarations and direct function-valued
   * variable initializers; unresolved callbacks retain normal .map() behavior.
   */
  private prepareNamedMapCallbacks(): void {
    type ImportedBinding = {
      source: string;
      importedName: string | null;
      namespace: boolean;
      statement: NodeOfType<"ImportDeclaration">;
      specifier: NodeOfType<
        "ImportSpecifier" | "ImportDefaultSpecifier" | "ImportNamespaceSpecifier"
      >;
      typeOnly: boolean;
      companionLocal?: Node;
    };

    type CallbackBinding = {
      name: string;
      callback: NodeOfType<
        "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression"
      > | null;
      statement: Node | null;
      statementList: Node[] | null;
      declarationKind?: string;
      variantName?: string;
      exportNames: string[];
      imported?: ImportedBinding;
    };

    type Scope = {
      parent: Scope | null;
      bindings: Map<string, CallbackBinding>;
      functionScope: Scope;
    };

    const insertions = new Map<Node[], Map<Node, Node[]>>();
    const exportCandidates = new Set<CallbackBinding>();
    const extraImports: Node[] = [];

    const createScope = (parent: Scope | null, isFunctionScope = false): Scope => {
      const scope = {
        parent,
        bindings: new Map<string, CallbackBinding>(),
        functionScope: null as unknown as Scope,
      };
      scope.functionScope = isFunctionScope ? scope : (parent?.functionScope ?? scope);
      return scope;
    };

    const bind = (
      scope: Scope,
      name: string,
      callback: NodeOfType<
        "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression"
      > | null = null,
      statement: Node | null = null,
      statementList: Node[] | null = null,
      declarationKind?: string,
      exportNames: string[] = [],
      imported?: ImportedBinding,
    ): CallbackBinding => {
      const binding: CallbackBinding = {
        name,
        callback,
        statement,
        statementList,
        declarationKind,
        exportNames,
        imported,
      };
      scope.bindings.set(name, binding);
      if (binding.callback && binding.exportNames.length > 0) {
        exportCandidates.add(binding);
      }
      return binding;
    };

    const bindPattern = (
      scope: Scope,
      pattern: Node,
      callback: NodeOfType<
        "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression"
      > | null,
      statement: Node | null,
      statementList: Node[] | null,
      declarationKind?: string,
      exportNames: string[] = [],
      imported?: ImportedBinding,
    ): void => {
      const names = this.collectBindingNames(pattern);
      for (const name of names) {
        const simple = isIdentifier(pattern) && pattern.name === name;
        bind(
          scope,
          name,
          simple ? callback : null,
          statement,
          statementList,
          declarationKind,
          simple ? exportNames : [],
          imported,
        );
      }
    };

    const getName = (node: Node | null | undefined): string | null => {
      if (isIdentifier(node)) return node.name;
      if (isLiteralString(node)) return node.value;
      return null;
    };

    const isValueExport = (statement: Node): boolean =>
      getNodeProperty(statement, "exportKind") !== "type";

    const collectStatements = (statements: Node[], scope: Scope): void => {
      // First collect declarations so local export aliases can point forward.
      for (const statement of statements) {
        const isExportNamed =
          isType(statement, "ExportNamedDeclaration") && isValueExport(statement);
        const isExportDefault = isType(statement, "ExportDefaultDeclaration");
        const declaration =
          (isExportNamed || isExportDefault) && isNode(statement.declaration)
            ? statement.declaration
            : statement;

        if (isFunctionDeclaration(declaration)) {
          const localName = declaration.id?.name ?? "default";
          const exportNames = isExportDefault
            ? ["default"]
            : isExportNamed && declaration.id
              ? [declaration.id.name]
              : [];
          bind(scope, localName, declaration, statement, statements, "function", exportNames);
          continue;
        }

        if (isVariableDeclaration(declaration)) {
          for (const item of declaration.declarations) {
            const init = item.init;
            const callback =
              isIdentifier(item.id) && isFunctionLike(init) && declaration.kind !== "var"
                ? init
                : null;
            const isFunctionValue = callback !== null;
            const isDirectExport = isExportNamed && !statement.source;
            const exportNames =
              isDirectExport && isIdentifier(item.id) && isFunctionValue ? [item.id.name] : [];
            const target = declaration.kind === "var" ? scope.functionScope : scope;
            bindPattern(
              target,
              item.id,
              callback,
              statement,
              statements,
              declaration.kind,
              exportNames,
            );
          }
          continue;
        }

        if (isImportDeclaration(statement)) {
          for (const specifier of statement.specifiers ?? []) {
            if (!specifier.local || !isIdentifier(specifier.local)) continue;

            const isNamespace = isType(specifier, "ImportNamespaceSpecifier");
            const isDefault = isType(specifier, "ImportDefaultSpecifier");
            const isNamed = isImportSpecifier(specifier);
            const importedName = isNamespace
              ? null
              : isDefault
                ? "default"
                : isNamed
                  ? getName(specifier.imported)
                  : null;
            const typeOnly =
              statement.importKind === "type" ||
              getNodeProperty(specifier, "importKind") === "type" ||
              (!importedName && !isNamespace);

            const imported: ImportedBinding = {
              source: statement.source?.value ?? "",
              importedName,
              namespace: isNamespace,
              statement,
              specifier,
              typeOnly,
            };

            bind(scope, specifier.local.name, null, statement, statements, "import", [], imported);
          }
          continue;
        }

        if (
          isType(declaration, "ClassDeclaration") &&
          declaration.id &&
          isIdentifier(declaration.id)
        ) {
          bind(scope, declaration.id.name);
        }
      }

      // Handle export aliases declared separately from their local bindings.
      for (const statement of statements) {
        if (
          isType(statement, "ExportNamedDeclaration") &&
          !statement.declaration &&
          !statement.source &&
          isValueExport(statement)
        ) {
          for (const specifier of statement.specifiers ?? []) {
            if (!isType(specifier, "ExportSpecifier")) continue;
            const localName = getName(specifier.local);
            const exportedName = getName(specifier.exported);
            if (!localName || !exportedName) continue;
            const binding = scope.bindings.get(localName);
            if (!binding?.callback) continue;
            if (!binding.exportNames.includes(exportedName)) {
              binding.exportNames.push(exportedName);
            }
            exportCandidates.add(binding);
          }
          continue;
        }

        // export default localCallback
        if (isType(statement, "ExportDefaultDeclaration") && isIdentifier(statement.declaration)) {
          const binding = scope.bindings.get(statement.declaration.name);
          if (binding?.callback && !binding.exportNames.includes("default")) {
            binding.exportNames.push("default");
            exportCandidates.add(binding);
          }
        }
      }
    };

    const resolve = (scope: Scope, name: string): CallbackBinding | null => {
      for (let current: Scope | null = scope; current; current = current.parent) {
        const binding = current.bindings.get(name);
        if (binding) return binding;
      }
      return null;
    };

    const isMapCall = (node: Node): node is NodeOfType<"CallExpression"> => {
      if (
        !isCallExpression(node) ||
        node.arguments.length < 1 ||
        node.arguments.some((argument) => isSpreadElement(argument))
      )
        return false;
      const callee = node.callee;
      if (!isMemberExpression(callee)) return false;
      if (callee.computed) {
        return isLiteralString(callee.property) && callee.property.value === "map";
      }
      return isIdentifier(callee.property) && callee.property.name === "map";
    };

    const callbackReturnsJSX = (callback: Node): boolean => {
      if (!isFunctionLike(callback) || callback.async || callback.generator || !callback.body) {
        return false;
      }

      return isBlockStatement(callback.body)
        ? this.containsJSXInReturns(callback.body)
        : this.containsJSX(callback.body);
    };

    const isLocalModuleSource = (specifier: string): boolean =>
      specifier.startsWith(".") ||
      specifier.startsWith("/") ||
      specifier.startsWith("@/") ||
      specifier.startsWith("~/");

    const companionName = (exportName: string): string => "__vynn_for_" + exportName;

    const createExportSpecifier = (localName: string, exportedName: string): Node =>
      generatedNode({
        type: "ExportSpecifier",
        local: identifier(localName),
        exported: identifier(exportedName),
        exportKind: "value",
      });

    const createCompanionExport = (localName: string, exportNames: string[]): Node =>
      generatedNode({
        type: "ExportNamedDeclaration",
        declaration: null,
        specifiers: exportNames.map((name) =>
          createExportSpecifier(localName, companionName(name)),
        ),
        source: null,
        exportKind: "value",
        attributes: [],
      });

    const createVariant = (binding: CallbackBinding): string | null => {
      // A default-exported named component can expose its existing $cmpnt
      // wrapper as the default companion. Other components aren't list callbacks.
      if (isComponentName(binding.name)) {
        if (binding.exportNames.includes("default") && binding.statement && binding.statementList) {
          let byAnchor = insertions.get(binding.statementList);
          if (!byAnchor) {
            byAnchor = new Map<Node, Node[]>();
            insertions.set(binding.statementList, byAnchor);
          }
          const added = byAnchor.get(binding.statement) ?? [];
          if (!added.some((node) => isType(node, "ExportNamedDeclaration"))) {
            added.push(createCompanionExport(binding.name, ["default"]));
          }
          byAnchor.set(binding.statement, added);
        }
        return null;
      }

      if (
        !binding.callback ||
        !binding.statement ||
        !binding.statementList ||
        binding.callback.async ||
        binding.callback.generator ||
        (binding.exportNames.length === 0 && !callbackReturnsJSX(binding.callback))
      ) {
        return null;
      }

      // Use one specialized variant for local maps and every exported alias.
      if (binding.variantName) return binding.variantName;

      const variantId = this.generateUidIdentifier(binding.name + "For");
      const variantName = variantId.name;
      const clonedCallback = cloneNode(binding.callback);
      let variantStatement: Node;

      if (isFunctionDeclaration(clonedCallback)) {
        setNodeProperty(clonedCallback, "id", cloneNode(variantId));
        this.specializedForCallbacks.add(clonedCallback);
        variantStatement = clonedCallback;
      } else {
        this.specializedForCallbacks.add(clonedCallback);
        variantStatement = variableDeclaration("const", [
          variableDeclarator(cloneNode(variantId), clonedCallback),
        ]);
      }

      binding.variantName = variantName;

      let byAnchor = insertions.get(binding.statementList);
      if (!byAnchor) {
        byAnchor = new Map<Node, Node[]>();
        insertions.set(binding.statementList, byAnchor);
      }

      const added = byAnchor.get(binding.statement) ?? [];
      added.push(variantStatement);
      if (binding.exportNames.length > 0) {
        added.push(createCompanionExport(variantName, [...new Set(binding.exportNames)]));
      }
      byAnchor.set(binding.statement, added);

      return variantName;
    };

    const getImportedCompanion = (binding: CallbackBinding): Node | null => {
      const imported = binding.imported;
      if (
        !imported ||
        imported.typeOnly ||
        imported.namespace ||
        !imported.importedName ||
        isComponentName(imported.importedName) ||
        !isLocalModuleSource(imported.source)
      ) {
        return null;
      }

      if (imported.companionLocal) {
        return cloneNode(imported.companionLocal);
      }

      const local = this.generateUidIdentifier(binding.name + "For");
      const addedSpecifier = generatedNode({
        type: "ImportSpecifier",
        imported: identifier(companionName(imported.importedName)),
        local: cloneNode(local),
        importKind: "value",
      });

      const hasNamespaceSpecifier = (imported.statement.specifiers ?? []).some((specifier: Node) =>
        isType(specifier, "ImportNamespaceSpecifier"),
      );
      const canAppend =
        imported.statement.importKind !== "type" &&
        getNodeProperty(imported.specifier, "importKind") !== "type" &&
        !hasNamespaceSpecifier;

      if (canAppend) {
        imported.statement.specifiers.push(addedSpecifier);
      } else {
        extraImports.push(
          generatedNode({
            type: "ImportDeclaration",
            specifiers: [addedSpecifier],
            source: stringLiteral(imported.source),
            importKind: "value",
            assertions: [],
            attributes: [],
          }),
        );
      }

      imported.companionLocal = local;
      return cloneNode(local);
    };

    const visitStatements = (statements: Node[], parent: Scope | null, isRoot = false): void => {
      const scope = createScope(parent, isRoot || !parent);
      collectStatements(statements, scope);
      for (const statement of statements) {
        visitNode(statement, scope, false);
      }
    };

    const visitNode = (node: Node, scope: Scope, renderChild: boolean): void => {
      if (!isNode(node)) return;

      // Only an expression in JSX output can trigger imported callback
      // specialization. Keep ordinary data processing such as items.map(format)
      // unchanged when the return behavior of the imported function is unknown.
      if (isJSXElement(node)) {
        visitNode(node.openingElement, scope, false);
        for (const child of node.children) {
          visitNode(child, scope, true);
        }
        return;
      }

      if (isJSXFragment(node)) {
        for (const child of node.children) {
          visitNode(child, scope, true);
        }
        return;
      }

      if (isJSXExpressionContainer(node)) {
        visitNode(node.expression, scope, renderChild);
        return;
      }

      if (isFunctionLike(node)) {
        const functionScope = createScope(scope, true);
        if (node.id && isIdentifier(node.id)) bind(functionScope, node.id.name);
        for (const parameter of node.params ?? []) {
          for (const name of this.collectBindingNames(parameter)) {
            bind(functionScope, name);
          }
        }
        if (node.body) {
          const collectFunctionScopedVars = (current: Node): void => {
            if (!isNode(current) || isFunctionLike(current)) return;
            if (isVariableDeclaration(current) && current.kind === "var") {
              for (const declaration of current.declarations) {
                bindPattern(functionScope, declaration.id, null, null, null, "var");
              }
            }
            forEachChild(current, collectFunctionScopedVars);
          };
          collectFunctionScopedVars(node.body);
          visitNode(node.body, functionScope, false);
        }
        return;
      }

      if (isBlockStatement(node)) {
        visitStatements(node.body, scope);
        return;
      }

      if (isMapCall(node)) {
        const callbackArgument = node.arguments[0];

        if (isIdentifier(callbackArgument)) {
          const binding = resolve(scope, callbackArgument.name);
          if (binding?.callback) {
            const variantName = createVariant(binding);
            if (variantName) {
              this.namedMapCallbacks.set(node, identifier(variantName));
            }
          } else if (renderChild && binding?.imported) {
            const importedCallback = getImportedCompanion(binding);
            if (importedCallback) {
              this.namedMapCallbacks.set(node, importedCallback);
            }
          }
        } else if (
          renderChild &&
          isMemberExpression(callbackArgument) &&
          isIdentifier(callbackArgument.object)
        ) {
          const namespace = resolve(scope, callbackArgument.object.name);
          const propertyName = callbackArgument.computed
            ? getName(callbackArgument.property)
            : isIdentifier(callbackArgument.property)
              ? callbackArgument.property.name
              : null;

          if (
            namespace?.imported?.namespace &&
            namespace.imported.source &&
            isLocalModuleSource(namespace.imported.source) &&
            propertyName &&
            !isComponentName(propertyName)
          ) {
            this.namedMapCallbacks.set(
              node,
              memberExpression(
                identifier(callbackArgument.object.name),
                identifier(companionName(propertyName)),
              ),
            );
          }
        }
      }

      forEachChild(node, (child) => visitNode(child, scope, renderChild));
    };

    visitStatements(this.program.body, null, true);

    // Exported function callbacks need companions even when this module does
    // not use them in a list; their consumers compile independently.
    for (const binding of exportCandidates) {
      createVariant(binding);
    }

    // Insert each variant and its companion export beside the source declaration.
    for (const [statements, byAnchor] of insertions) {
      const rebuilt: Node[] = [];
      for (const statement of statements) {
        rebuilt.push(statement);
        const added = byAnchor.get(statement);
        if (added) rebuilt.push(...added);
      }
      statements.splice(0, statements.length, ...rebuilt);
    }

    if (extraImports.length > 0) {
      setNodeProperty(this.program, "body", [...this.program.body, ...extraImports]);
    }
  }

  private transformTopLevelStatement(statement: Node): Node | Node[] {
    if (isType(statement, "ExportDefaultDeclaration")) {
      const declaration = statement.declaration;

      if (isFunctionDeclaration(declaration)) {
        if (declaration.id && isComponentName(declaration.id.name)) {
          const transformed = this.transformComponentDeclaration(declaration);

          if (isVariableDeclaration(transformed) && transformed.declarations.length === 1) {
            // Keep the named component in module scope so a companion export can
            // reference the already-wrapped $cmpnt function.
            return [
              transformed,
              inheritSourceLocation(
                {
                  ...statement,
                  declaration: identifier(declaration.id.name),
                },
                statement,
              ),
            ];
          }
        }

        if (!declaration.id) {
          setNodeProperty(
            statement,
            "declaration",
            this.createComponentFunction(
              null,
              declaration.params,
              declaration.body,
              !!declaration.generator,
              !!declaration.async,
              declaration,
            ),
          );
          return statement;
        }

        setNodeProperty(statement, "declaration", this.visitNestedDeclarations(declaration));
        return statement;
      }

      if (isArrowFunctionExpression(declaration) || isFunctionExpression(declaration)) {
        setNodeProperty(
          statement,
          "declaration",
          this.createComponentFunction(
            null,
            declaration.params,
            declaration.body,
            !!declaration.generator,
            !!declaration.async,
            declaration,
          ),
        );
        return statement;
      }
    }

    if (isExpressionStatement(statement)) {
      setNodeProperty(
        statement,
        "expression",
        this.transformEmbeddedExpression(statement.expression, this.createIdentifierAllocator()),
      );
      return statement;
    }

    return this.transformStatement(statement, this.createIdentifierAllocator());
  }

  /**
   * Babel's visitors also reached declarators nested under export wrappers,
   * ordinary functions, conditionals and blocks. Walk those structures while
   * only transforming component declarations and variable initializers here;
   * component bodies and arbitrary expressions have their own lowering path.
   */
  private visitNestedDeclarations(node: Node): Node {
    if (!isNode(node)) return node;

    // Component declarations are transformed into $cmpnt(...) wrappers.
    if (isFunctionDeclaration(node)) {
      if (node.id && isComponentName(node.id.name)) {
        const transformed = this.transformComponentDeclaration(node);

        if (transformed !== node) {
          return transformed;
        }
      }

      // Ordinary functions still need their JSX expressions transformed.
      // This handles functions such as:
      //
      // export function render(url) {
      //   return renderToServer(() => {
      //     return <App url={url} />;
      //   }, "stream");
      // }
      //
      // transformBlockStatement lowers return expressions, callbacks,
      // variable initializers, and nested JSX expressions.
      const allocator = this.createIdentifierAllocator();
      setNodeProperty(
        node,
        "body",
        this.specializedForCallbacks.has(node)
          ? this.withForCallback(node.params ?? [], () =>
              this.transformBlockStatement(node.body, allocator),
            )
          : this.transformBlockStatement(node.body, allocator),
      );

      return node;
    }

    if (isVariableDeclaration(node)) {
      for (const declaration of node.declarations) {
        if (
          isComponentFunctionDeclaration(declaration) &&
          this.transformComponentVariable(declaration)
        ) {
          continue;
        }

        if (declaration.init && isExpression(declaration.init)) {
          this.assertJSXInitializerIsLazy(declaration);

          setNodeProperty(
            declaration,
            "init",
            this.transformEmbeddedExpression(declaration.init, this.createIdentifierAllocator()),
          );
        }
      }

      return node;
    }

    for (const key of getVisitorKeys(node)) {
      const value = getNodeProperty(node, key);

      if (isNodeArray(value)) {
        setNodeProperty(
          node,
          key,
          value.map((child) => (isNode(child) ? this.visitNestedDeclarations(child) : child)),
        );
      } else if (isNode(value)) {
        setNodeProperty(node, key, this.visitNestedDeclarations(value));
      }
    }

    return node;
  }

  private createComponentFunction(
    name: Node | null,
    params: Node[],
    body: Node,
    generator: boolean,
    async: boolean,
    source: Node,
  ): Node {
    const allocator = this.createIdentifierAllocator();
    const transformedBody = this.transformComponentPropsParameter(params, body);
    let functionBody: Node;

    if (isBlockStatement(transformedBody)) {
      this.transformComponentBody(transformedBody, allocator);
      functionBody = transformedBody;
    } else {
      if (!isExpression(transformedBody)) {
        throw new Error(`[Vynn] Unsupported component body in ${this.filename}.`);
      }

      const statements: Node[] = [];
      const transformedExpression = this.transformStatementContextExpression(
        transformedBody,
        allocator,
        statements,
        isJSXFragment(transformedBody),
      );
      statements.push(returnStatement(transformedExpression));
      functionBody = blockStatement(statements);
    }

    const component = functionExpression(
      name ? cloneNode(name) : null,
      params,
      functionBody,
      generator,
      async,
    );

    return inheritSourceLocation(
      callExpression(this.getRuntimeHelper("$cmpnt"), [component]),
      source,
    );
  }

  private transformComponentDeclaration(node: NodeOfType<"FunctionDeclaration">): Node {
    const id = node.id;
    if (!id) return node;

    const wrapped = this.createComponentFunction(
      cloneNode(id),
      node.params,
      node.body,
      !!node.generator,
      !!node.async,
      node,
    );

    return inheritSourceLocation(
      variableDeclaration("const", [variableDeclarator(cloneNode(id), wrapped)]),
      node,
    );
  }

  private transformComponentVariable(declaration: Node): boolean {
    if (!isComponentFunctionDeclaration(declaration)) return false;

    const component = declaration.init;
    const wrapped = this.createComponentFunction(
      identifier(declaration.id.name),
      component.params,
      component.body,
      !!component.generator,
      !!component.async,
      component,
    );

    setNodeProperty(declaration, "init", wrapped);
    return true;
  }

  private transformComponentBody(
    body: NodeOfType<"BlockStatement">,
    allocator: IdentifierAllocator,
  ): void {
    this.transformBlockStatement(body, allocator);
  }

  /**
   * Arrays use iterator-based destructuring, so only object patterns are
   * lowered to property access. Unsupported patterns stay native as a whole.
   */
  private isSupportedComponentPropPattern(pattern: Node): boolean {
    if (isIdentifier(pattern)) return true;
    if (isAssignmentPattern(pattern)) return this.isSupportedComponentPropPattern(pattern.left);
    if (isRestElement(pattern)) return isIdentifier(pattern.argument);
    if (!isObjectPattern(pattern)) return false;
    return pattern.properties.every((property) => {
      if (isRestElement(property)) return isIdentifier(property.argument);
      return isType(property, "Property") && this.isSupportedComponentPropPattern(property.value);
    });
  }

  /**
   * Rewrite destructured component props to property access on a single props
   * parameter. Lazy accessors are generated only where destructuring semantics
   * need state (defaults, computed keys, and object rest).
   */
  private transformComponentPropsParameter(params: Node[], body: Node): Node {
    const parameter = params[0];
    if (!parameter) return body;

    const hasDefault = isAssignmentPattern(parameter);
    const pattern = hasDefault ? parameter.left : parameter;
    if (!isObjectPattern(pattern) || !this.isSupportedComponentPropPattern(pattern)) return body;

    // Vynn components receive a single props object. If a function declares
    // later positional parameters, keep native destructuring so parameter
    // initializers can still reference the original parameter bindings.
    if (params.length > 1) return body;

    const propsName = this.usedNames.has("props")
      ? this.generateUidIdentifier("props").name
      : "props";
    this.usedNames.add(propsName);

    const directBindings = new Set<string>();
    if (isBlockStatement(body)) this.collectDirectBlockBindings(body, directBindings);
    const patternBindings = this.collectBindingNames(pattern);
    if ([...patternBindings].some((name) => directBindings.has(name))) {
      // A parameter and a direct lexical declaration with the same name is
      // invalid JavaScript. Keep the source pattern untouched if Oxc has not
      // reported that semantic error instead of generating a different scope.
      return body;
    }

    const props = identifier(propsName);
    const replacements = new Map<string, Node>();
    const prologue: NodeOfType<"VariableDeclaration">[] = [];
    if (!this.collectComponentPropBindings(pattern, props, replacements, prologue)) return body;

    const functionVars = new Set<string>();
    if (isBlockStatement(body)) this.collectFunctionVarBindings(body, functionVars);

    const shadowed = new Set<string>(directBindings);
    for (const name of functionVars) shadowed.add(name);

    // Parameter bindings are mutable local bindings in JavaScript. If a prop
    // binding is written, keep that binding local instead of turning e.g.
    // `count++` into `props.count++`.
    const writes = new Set<string>();
    this.collectWritableComponentPropReferences(
      body,
      new Set(replacements.keys()),
      writes,
      shadowed,
    );
    const localBindings = new Set<string>(writes);
    for (const name of functionVars) {
      if (replacements.has(name)) localBindings.add(name);
    }

    const localDeclarations: NodeOfType<"VariableDeclaration">[] = [];
    for (const name of localBindings) {
      const access = replacements.get(name);
      if (!access) continue;
      localDeclarations.push(
        variableDeclaration(functionVars.has(name) ? "var" : "let", [
          variableDeclarator(identifier(name), cloneNode(access)),
        ]),
      );
      replacements.delete(name);
    }
    // Accessor declarations must precede locals that read those accessors.
    prologue.push(...localDeclarations);

    if (isBlockStatement(body)) {
      setNodeProperty(
        body,
        "body",
        body.body.map((statement: Node) =>
          this.rewriteComponentPropReferences(statement, replacements, shadowed),
        ),
      );
    } else {
      body = this.rewriteComponentPropReferences(body, replacements, shadowed);
    }

    // Keep the original TS annotation on the replacement props identifier.
    for (const key of ["typeAnnotation", "optional", "decorators"]) {
      const value = getNodeProperty(pattern, key) ?? getNodeProperty(parameter, key);
      if (value !== undefined)
        setNodeProperty(props, key, isNode(value) ? cloneNode(value) : value);
    }

    params[0] = hasDefault
      ? inheritSourceLocation(
          generatedNode({ type: "AssignmentPattern", left: props, right: parameter.right }),
          parameter,
        )
      : inheritSourceLocation(props, parameter);

    if (prologue.length === 0) return body;

    if (isBlockStatement(body)) {
      let insertionIndex = 0;
      // Directives must stay at the start of a function body.
      while (insertionIndex < body.body.length) {
        const statement = body.body[insertionIndex];
        if (
          !isExpressionStatement(statement) ||
          !isType(statement.expression, "Literal") ||
          typeof statement.expression.value !== "string"
        )
          break;
        insertionIndex++;
      }
      body.body.splice(insertionIndex, 0, ...prologue);
      return body;
    }

    // An expression-bodied arrow needs a block when generated lazy accessors
    // or mutable local bindings are required.
    return blockStatement([...prologue, returnStatement(body)]);
  }

  /** Build replacement expressions for bindings introduced by a props pattern. */
  private collectComponentPropBindings(
    pattern: Node,
    access: Node,
    replacements: Map<string, Node>,
    prologue: NodeOfType<"VariableDeclaration">[],
  ): boolean {
    return this.collectComponentPropBindingsAtPath(pattern, access, [], replacements, prologue);
  }

  private collectComponentPropBindingsAtPath(
    pattern: Node,
    baseAccess: Node,
    path: ComponentPropAccessStep[],
    replacements: Map<string, Node>,
    prologue: NodeOfType<"VariableDeclaration">[],
  ): boolean {
    if (isIdentifier(pattern)) {
      const capitalized = pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1);

      replacements.set(
        pattern.name,
        this.createComponentPropPathAccess(baseAccess, path, prologue, `get${capitalized}`),
      );

      return true;
    }

    if (isAssignmentPattern(pattern)) {
      if (path.length === 0) return false;

      const fallbackExpression = this.rewriteComponentPropReferences(
        cloneNode(pattern.right),
        replacements,
        new Set(),
      );

      const fallback = this.createCachedFallbackGetter(
        fallbackExpression,
        prologue,
        "propDefaultFallback",
      );

      const nextPath = path.slice();
      const lastIndex = nextPath.length - 1;

      nextPath[lastIndex] = {
        ...nextPath[lastIndex],
        fallback,
      };

      return this.collectComponentPropBindingsAtPath(
        pattern.left,
        baseAccess,
        nextPath,
        replacements,
        prologue,
      );
    }

    if (isObjectPattern(pattern)) {
      for (let index = 0; index < pattern.properties.length; index++) {
        const property = pattern.properties[index] as Node;

        if (isRestElement(property)) {
          const restSource = this.createComponentPropPathAccess(
            baseAccess,
            path,
            prologue,
            "getRestSource",
          );

          const restExpression = this.createComponentObjectRest(
            restSource,
            pattern.properties.slice(0, index),
            replacements,
          );

          const restAccess = this.createCachedExpressionAccess(
            restExpression,
            prologue,
            "propRest",
          );

          if (
            !this.collectComponentPropBindingsAtPath(
              property.argument,
              restAccess,
              [],
              replacements,
              prologue,
            )
          ) {
            return false;
          }

          continue;
        }

        if (!isType(property, "Property") || !property.value) {
          return false;
        }

        let key: Node = cloneNode(property.key);
        const computed = !!property.computed;

        if (computed && !isType(key, "Literal")) {
          key = this.rewriteComponentPropReferences(key, replacements, new Set());

          const cachedKey = this.generateUidIdentifier("propKey");

          prologue.push(
            variableDeclaration("const", [variableDeclarator(cloneNode(cachedKey), key)]),
          );

          // Keep the cached key available to object-rest exclusions.
          setNodeProperty(property, "key", cloneNode(cachedKey));
          key = cachedKey;
        }

        const nextPath: ComponentPropAccessStep[] = [
          ...path,
          {
            key: cloneNode(key),
            computed: computed || !isIdentifier(key),
          },
        ];

        if (
          !this.collectComponentPropBindingsAtPath(
            property.value,
            baseAccess,
            nextPath,
            replacements,
            prologue,
          )
        ) {
          return false;
        }
      }

      return true;
    }

    // Array patterns retain native iterator-based destructuring semantics.
    if (isArrayPattern(pattern)) return false;

    return false;
  }

  /**
   * Creates a cached fallback factory.
   *
   * The fallback expression itself is evaluated only when its value is needed.
   * Its result is reused by every access to this fallback.
   */
  private createCachedFallbackGetter(
    expression: Node,
    prologue: NodeOfType<"VariableDeclaration">[],
    hint: string,
  ): Node {
    const getter = this.generateUidIdentifier(hint);

    prologue.push(
      variableDeclaration("const", [
        variableDeclarator(
          cloneNode(getter),
          callExpression(this.getRuntimeHelper("$cache"), [
            arrowFunctionExpression([], expression),
          ]),
        ),
      ]),
    );

    return getter;
  }

  /**
   * Builds the complete property path.
   *
   * Plain paths become ordinary member expressions. If any path segment has a
   * default, create one getter that resolves the entire path from left to right.
   */
  private createComponentPropPathAccess(
    baseAccess: Node,
    path: ComponentPropAccessStep[],
    prologue: NodeOfType<"VariableDeclaration">[],
    hint: string,
  ): Node {
    const hasFallback = path.some((step) => step.fallback !== undefined);

    if (!hasFallback) {
      let access = cloneNode(baseAccess);

      for (const step of path) {
        access = memberExpression(access, cloneNode(step.key), step.computed);
      }

      return access;
    }

    const getter = this.generateUidIdentifier(hint);
    const statements: Node[] = [];

    let current = cloneNode(baseAccess);

    for (const step of path) {
      const value = this.generateUidIdentifier(`${hint}Value`);

      statements.push(
        variableDeclaration("const", [
          variableDeclarator(
            cloneNode(value),
            memberExpression(cloneNode(current), cloneNode(step.key), step.computed),
          ),
        ]),
      );

      current = cloneNode(value);

      if (step.fallback) {
        const resolved = this.generateUidIdentifier(`${hint}Resolved`);

        statements.push(
          variableDeclaration("const", [
            variableDeclarator(
              cloneNode(resolved),
              conditionalExpression(
                binaryExpression("!==", cloneNode(value), voidZero()),
                cloneNode(value),
                callExpression(cloneNode(step.fallback), []),
              ),
            ),
          ]),
        );

        current = cloneNode(resolved);
      }
    }

    statements.push(returnStatement(cloneNode(current)));

    prologue.push(
      variableDeclaration("const", [
        variableDeclarator(
          cloneNode(getter),
          arrowFunctionExpression([], blockStatement(statements)),
        ),
      ]),
    );

    return callExpression(cloneNode(getter), []);
  }

  /**
   * Build a lazy, per-component accessor. When sourceAccess is supplied, the
   * current prop wins whenever defined and the fallback is cached on first use.
   * Without it, the computed value itself is cached on first use (object rest).
   */
  private createCachedExpressionAccess(
    expression: Node,
    prologue: NodeOfType<"VariableDeclaration">[],
    hint: string,
  ): Node {
    const getter = this.generateUidIdentifier(`${hint}Getter`);

    prologue.push(
      variableDeclaration("const", [
        variableDeclarator(
          cloneNode(getter),
          callExpression(this.getRuntimeHelper("$cache"), [
            arrowFunctionExpression([], expression),
          ]),
        ),
      ]),
    );

    return callExpression(cloneNode(getter), []);
  }

  /** Preserve the object-rest exclusion semantics of the original pattern. */
  private createComponentObjectRest(
    access: Node,
    excludedProperties: Node[],
    replacements: Map<string, Node>,
  ): Node {
    const rest = this.generateUidIdentifier("rest");
    const properties: Node[] = [];

    for (const property of excludedProperties) {
      if (!isType(property, "Property")) continue;
      const key = property.computed
        ? this.rewriteComponentPropReferences(cloneNode(property.key), replacements, new Set())
        : cloneNode(property.key);
      properties.push(
        objectProperty(key, this.generateUidIdentifier("excluded"), {
          computed: !!property.computed,
        }),
      );
    }
    properties.push(generatedNode({ type: "RestElement", argument: cloneNode(rest) }));
    const pattern = generatedNode({ type: "ObjectPattern", properties: [] });
    setNodeProperty(pattern, "properties", properties);
    return callExpression(
      arrowFunctionExpression([pattern], blockStatement([returnStatement(cloneNode(rest))])),
      [cloneNode(access)],
    );
  }

  private collectDirectBlockBindings(block: Node, names: Set<string>): void {
    if (!isBlockStatement(block)) return;
    for (const statement of block.body) {
      if (isVariableDeclaration(statement) && statement.kind !== "var") {
        for (const declaration of statement.declarations)
          this.collectBindingNames(declaration.id, names);
      } else if (
        (isFunctionDeclaration(statement) || isType(statement, "ClassDeclaration")) &&
        statement.id &&
        isIdentifier(statement.id)
      ) {
        names.add(statement.id.name);
      }
    }
  }

  private collectSwitchBindings(statement: Node, names: Set<string>): void {
    if (!isType(statement, "SwitchStatement")) return;
    for (const switchCase of statement.cases) {
      for (const child of switchCase.consequent) {
        if (isVariableDeclaration(child) && child.kind !== "var") {
          for (const declaration of child.declarations)
            this.collectBindingNames(declaration.id, names);
        } else if (
          (isFunctionDeclaration(child) || isType(child, "ClassDeclaration")) &&
          child.id &&
          isIdentifier(child.id)
        ) {
          names.add(child.id.name);
        }
      }
    }
  }

  private collectFunctionVarBindings(node: Node, names: Set<string>): void {
    const visit = (current: Node): void => {
      if (!isNode(current) || isFunctionLike(current)) return;
      if (isVariableDeclaration(current) && current.kind === "var") {
        for (const declaration of current.declarations)
          this.collectBindingNames(declaration.id, names);
      }
      forEachChild(current, visit);
    };
    visit(node);
  }

  private isTypeOnlyPropRewriteKey(key: string): boolean {
    return (
      key === "typeAnnotation" ||
      key === "returnType" ||
      key === "typeParameters" ||
      key === "typeArguments" ||
      key === "superTypeArguments" ||
      key === "implements" ||
      key === "predicate" ||
      key === "constraint" ||
      key === "defaultType"
    );
  }

  private isComponentPropReference(parent: Node | undefined, key: string | undefined): boolean {
    if (!parent || !key) return true;
    if (isMemberExpression(parent) && key === "property" && !parent.computed) return false;
    if (isType(parent, "Property") && key === "key" && !parent.computed) return false;
    if (isType(parent, "MethodDefinition") && key === "key" && !parent.computed) return false;
    if (
      (isType(parent, "LabeledStatement") ||
        isType(parent, "BreakStatement") ||
        isType(parent, "ContinueStatement")) &&
      key === "label"
    )
      return false;
    if (
      isType(parent, "ImportSpecifier") ||
      isType(parent, "ExportSpecifier") ||
      isType(parent, "MetaProperty")
    )
      return false;
    return true;
  }

  /** Rewrite default expressions and computed keys inside a binding pattern. */
  private rewriteComponentPropPatternExpressions(
    pattern: Node,
    replacements: Map<string, Node>,
    shadowed: Set<string>,
  ): Node {
    if (isAssignmentPattern(pattern)) {
      setNodeProperty(
        pattern,
        "left",
        this.rewriteComponentPropPatternExpressions(pattern.left, replacements, shadowed),
      );
      setNodeProperty(
        pattern,
        "right",
        this.rewriteComponentPropReferences(pattern.right, replacements, shadowed),
      );
      return pattern;
    }
    if (isRestElement(pattern)) {
      setNodeProperty(
        pattern,
        "argument",
        this.rewriteComponentPropPatternExpressions(pattern.argument, replacements, shadowed),
      );
      return pattern;
    }
    if (isArrayPattern(pattern)) {
      setNodeProperty(
        pattern,
        "elements",
        pattern.elements.map((element: Node | null) =>
          element
            ? this.rewriteComponentPropPatternExpressions(element, replacements, shadowed)
            : null,
        ),
      );
      return pattern;
    }
    if (isObjectPattern(pattern)) {
      for (const property of pattern.properties) {
        if (isRestElement(property)) {
          this.rewriteComponentPropPatternExpressions(property, replacements, shadowed);
          continue;
        }
        if (!isType(property, "Property")) continue;
        if (property.computed) {
          setNodeProperty(
            property,
            "key",
            this.rewriteComponentPropReferences(
              property.key,
              replacements,
              shadowed,
              property,
              "key",
            ),
          );
        }
        setNodeProperty(
          property,
          "value",
          this.rewriteComponentPropPatternExpressions(property.value, replacements, shadowed),
        );
      }
    }
    return pattern;
  }

  /** Find writes to prop bindings before rewriting reads to props.property. */
  private collectWritableComponentPropReferences(
    node: Node,
    propNames: Set<string>,
    writes: Set<string>,
    shadowed: Set<string>,
    writeTarget = false,
  ): void {
    if (!isNode(node)) return;

    if (isIdentifier(node)) {
      if (writeTarget && propNames.has(node.name) && !shadowed.has(node.name))
        writes.add(node.name);
      return;
    }

    if (isFunctionLike(node)) {
      // Parameter initializers execute in the parameter environment, before
      // body-scoped var bindings are created.
      const parameterScope = new Set(shadowed);
      if (node.id && isIdentifier(node.id)) parameterScope.add(node.id.name);
      for (const parameter of node.params ?? [])
        this.collectBindingNames(parameter, parameterScope);
      for (const parameter of node.params ?? [])
        this.collectWritablePatternExpressions(parameter, propNames, writes, parameterScope);

      const local = new Set(parameterScope);
      if (isBlockStatement(node.body)) {
        this.collectDirectBlockBindings(node.body, local);
        this.collectFunctionVarBindings(node.body, local);
      }
      if (isNode(node.body))
        this.collectWritableComponentPropReferences(node.body, propNames, writes, local);
      return;
    }

    if (isBlockStatement(node)) {
      const local = new Set(shadowed);
      this.collectDirectBlockBindings(node, local);
      node.body.forEach((statement: Node) =>
        this.collectWritableComponentPropReferences(statement, propNames, writes, local),
      );
      return;
    }

    if (isType(node, "AssignmentExpression")) {
      this.collectWritableComponentPropReferences(node.left, propNames, writes, shadowed, true);
      this.collectWritableComponentPropReferences(node.right, propNames, writes, shadowed);
      return;
    }
    if (isUpdateExpression(node)) {
      this.collectWritableComponentPropReferences(node.argument, propNames, writes, shadowed, true);
      return;
    }

    if (
      isType(node, "ForStatement") ||
      isType(node, "ForInStatement") ||
      isType(node, "ForOfStatement")
    ) {
      const local = new Set(shadowed);
      const binding = getNodeProperty(node, "init") ?? getNodeProperty(node, "left");
      const isDeclaration = isVariableDeclaration(binding);
      if (isDeclaration && binding.kind !== "var") {
        for (const declaration of binding.declarations)
          this.collectBindingNames(declaration.id, local);
      }
      for (const key of getVisitorKeys(node)) {
        const value = getNodeProperty(node, key);
        if (key === "left" && isDeclaration) {
          if (isVariableDeclaration(value)) {
            for (const declaration of value.declarations) {
              if (declaration.init)
                this.collectWritableComponentPropReferences(
                  declaration.init,
                  propNames,
                  writes,
                  local,
                );
            }
          }
          continue;
        }
        if (isNodeArray(value)) {
          for (const child of value)
            if (isNode(child))
              this.collectWritableComponentPropReferences(
                child,
                propNames,
                writes,
                local,
                key === "left",
              );
        } else if (isNode(value)) {
          this.collectWritableComponentPropReferences(
            value,
            propNames,
            writes,
            local,
            key === "left",
          );
        }
      }
      return;
    }

    if (isType(node, "VariableDeclarator")) {
      if (node.init)
        this.collectWritableComponentPropReferences(node.init, propNames, writes, shadowed);
      return;
    }

    if (isType(node, "CatchClause")) {
      const local = new Set(shadowed);
      if (node.param) this.collectBindingNames(node.param, local);
      if (node.body)
        this.collectWritableComponentPropReferences(node.body, propNames, writes, local);
      return;
    }

    if (isType(node, "SwitchStatement")) {
      // The discriminant runs outside the switch's lexical case scope.
      this.collectWritableComponentPropReferences(node.discriminant, propNames, writes, shadowed);
      const local = new Set(shadowed);
      this.collectSwitchBindings(node, local);
      for (const switchCase of node.cases) {
        if (switchCase.test)
          this.collectWritableComponentPropReferences(switchCase.test, propNames, writes, local);
        for (const statement of switchCase.consequent)
          this.collectWritableComponentPropReferences(statement, propNames, writes, local);
      }
      return;
    }

    if (isType(node, "Property")) {
      if (node.computed)
        this.collectWritableComponentPropReferences(node.key, propNames, writes, shadowed);
      this.collectWritableComponentPropReferences(
        node.value,
        propNames,
        writes,
        shadowed,
        writeTarget,
      );
      return;
    }
    if (isType(node, "MemberExpression") && writeTarget) {
      // `value.field = x` mutates the referenced object, not the value binding.
      this.collectWritableComponentPropReferences(node.object, propNames, writes, shadowed);
      if (node.computed)
        this.collectWritableComponentPropReferences(node.property, propNames, writes, shadowed);
      return;
    }
    if (writeTarget && isType(node, "ObjectPattern")) {
      for (const property of node.properties)
        this.collectWritableComponentPropReferences(property, propNames, writes, shadowed, true);
      return;
    }
    if (writeTarget && isArrayPattern(node)) {
      for (const element of node.elements as Array<Node | null>)
        if (element)
          this.collectWritableComponentPropReferences(element, propNames, writes, shadowed, true);
      return;
    }
    if (writeTarget && isRestElement(node)) {
      this.collectWritableComponentPropReferences(node.argument, propNames, writes, shadowed, true);
      return;
    }
    if (writeTarget && isAssignmentPattern(node)) {
      this.collectWritableComponentPropReferences(node.left, propNames, writes, shadowed, true);
      this.collectWritableComponentPropReferences(node.right, propNames, writes, shadowed);
      return;
    }

    for (const key of getVisitorKeys(node)) {
      if (this.isTypeOnlyPropRewriteKey(key)) continue;
      const value = getNodeProperty(node, key);
      if (isNodeArray(value)) {
        for (const child of value)
          if (isNode(child))
            this.collectWritableComponentPropReferences(child, propNames, writes, shadowed);
      } else if (isNode(value)) {
        this.collectWritableComponentPropReferences(value, propNames, writes, shadowed);
      }
    }
  }

  private collectWritablePatternExpressions(
    pattern: Node,
    propNames: Set<string>,
    writes: Set<string>,
    shadowed: Set<string>,
  ): void {
    if (isAssignmentPattern(pattern)) {
      this.collectWritableComponentPropReferences(pattern.right, propNames, writes, shadowed);
      this.collectWritablePatternExpressions(pattern.left, propNames, writes, shadowed);
    } else if (isRestElement(pattern)) {
      this.collectWritablePatternExpressions(pattern.argument, propNames, writes, shadowed);
    } else if (isArrayPattern(pattern)) {
      for (const element of pattern.elements as Array<Node | null>)
        if (element) this.collectWritablePatternExpressions(element, propNames, writes, shadowed);
    } else if (isObjectPattern(pattern)) {
      for (const property of pattern.properties) {
        if (isRestElement(property)) {
          this.collectWritablePatternExpressions(property, propNames, writes, shadowed);
        } else if (isType(property, "Property")) {
          if (property.computed)
            this.collectWritableComponentPropReferences(property.key, propNames, writes, shadowed);
          this.collectWritablePatternExpressions(property.value, propNames, writes, shadowed);
        }
      }
    }
  }

  /** Rewrite references only; declaration/binding identifiers stay untouched. */
  private rewriteComponentPropReferences(
    node: Node,
    replacements: Map<string, Node>,
    shadowed: Set<string>,
    parent?: Node,
    parentKey?: string,
  ): Node {
    if (!isNode(node)) return node;

    if (isIdentifier(node)) {
      const replacement = replacements.get(node.name);
      if (
        replacement &&
        !shadowed.has(node.name) &&
        this.isComponentPropReference(parent, parentKey)
      ) {
        if (parent && isType(parent, "Property") && parentKey === "value" && parent.shorthand)
          setNodeProperty(parent, "shorthand", false);
        return inheritSourceLocation(cloneNode(replacement), node);
      }
      return node;
    }

    if (isFunctionLike(node)) {
      const parameterScope = new Set(shadowed);
      if (node.id && isIdentifier(node.id)) parameterScope.add(node.id.name);
      for (const parameter of node.params ?? [])
        this.collectBindingNames(parameter, parameterScope);
      for (const parameter of node.params ?? [])
        this.rewriteComponentPropPatternExpressions(parameter, replacements, parameterScope);

      const local = new Set(parameterScope);
      if (isBlockStatement(node.body)) {
        this.collectDirectBlockBindings(node.body, local);
        this.collectFunctionVarBindings(node.body, local);
      }

      for (const key of getVisitorKeys(node)) {
        if (key === "id" || key === "params" || this.isTypeOnlyPropRewriteKey(key)) continue;
        const value = getNodeProperty(node, key);
        if (isNodeArray(value)) {
          setNodeProperty(
            node,
            key,
            value.map((child) =>
              isNode(child)
                ? this.rewriteComponentPropReferences(child, replacements, local, node, key)
                : child,
            ),
          );
        } else if (isNode(value)) {
          setNodeProperty(
            node,
            key,
            this.rewriteComponentPropReferences(value, replacements, local, node, key),
          );
        }
      }
      return node;
    }

    if (isType(node, "VariableDeclarator")) {
      if (isNode(node.init))
        setNodeProperty(
          node,
          "init",
          this.rewriteComponentPropReferences(node.init, replacements, shadowed, node, "init"),
        );
      return node;
    }

    if (isType(node, "Property")) {
      if (node.computed && isNode(node.key))
        setNodeProperty(
          node,
          "key",
          this.rewriteComponentPropReferences(node.key, replacements, shadowed, node, "key"),
        );
      const oldValue = node.value;
      if (isNode(oldValue))
        setNodeProperty(
          node,
          "value",
          this.rewriteComponentPropReferences(oldValue, replacements, shadowed, node, "value"),
        );
      if (node.shorthand && node.value !== oldValue) node.shorthand = false;
      return node;
    }

    if (isBlockStatement(node)) {
      const local = new Set(shadowed);
      this.collectDirectBlockBindings(node, local);
      setNodeProperty(
        node,
        "body",
        node.body.map((statement: Node) =>
          this.rewriteComponentPropReferences(statement, replacements, local, node, "body"),
        ),
      );
      return node;
    }

    if (isType(node, "CatchClause")) {
      const local = new Set(shadowed);
      if (node.param) this.collectBindingNames(node.param, local);
      if (isNode(node.body))
        setNodeProperty(
          node,
          "body",
          this.rewriteComponentPropReferences(node.body, replacements, local, node, "body"),
        );
      return node;
    }

    if (isType(node, "SwitchStatement")) {
      setNodeProperty(
        node,
        "discriminant",
        this.rewriteComponentPropReferences(
          node.discriminant,
          replacements,
          shadowed,
          node,
          "discriminant",
        ),
      );
      const local = new Set(shadowed);
      this.collectSwitchBindings(node, local);
      setNodeProperty(
        node,
        "cases",
        node.cases.map((switchCase: Node) =>
          this.rewriteComponentPropReferences(switchCase, replacements, local, node, "cases"),
        ),
      );
      return node;
    }

    if (isType(node, "ClassDeclaration") || isType(node, "ClassExpression")) {
      const local = new Set(shadowed);
      if (node.id && isIdentifier(node.id)) local.add(node.id.name);
      for (const key of getVisitorKeys(node)) {
        if (key === "id" || this.isTypeOnlyPropRewriteKey(key)) continue;
        const value = getNodeProperty(node, key);
        if (isNodeArray(value)) {
          setNodeProperty(
            node,
            key,
            value.map((child) =>
              isNode(child)
                ? this.rewriteComponentPropReferences(child, replacements, local, node, key)
                : child,
            ),
          );
        } else if (isNode(value)) {
          setNodeProperty(
            node,
            key,
            this.rewriteComponentPropReferences(value, replacements, local, node, key),
          );
        }
      }
      return node;
    }

    if (
      isType(node, "ForStatement") ||
      isType(node, "ForInStatement") ||
      isType(node, "ForOfStatement")
    ) {
      const local = new Set(shadowed);
      const binding = getNodeProperty(node, "init") ?? getNodeProperty(node, "left");
      if (isVariableDeclaration(binding) && binding.kind !== "var") {
        for (const declaration of binding.declarations)
          this.collectBindingNames(declaration.id, local);
      }
      for (const key of getVisitorKeys(node)) {
        if (this.isTypeOnlyPropRewriteKey(key)) continue;
        const value = getNodeProperty(node, key);
        if (isNodeArray(value)) {
          setNodeProperty(
            node,
            key,
            value.map((child) =>
              isNode(child)
                ? this.rewriteComponentPropReferences(child, replacements, local, node, key)
                : child,
            ),
          );
        } else if (isNode(value)) {
          setNodeProperty(
            node,
            key,
            this.rewriteComponentPropReferences(value, replacements, local, node, key),
          );
        }
      }
      return node;
    }

    for (const key of getVisitorKeys(node)) {
      if (
        this.isTypeOnlyPropRewriteKey(key) ||
        ((isType(node, "LabeledStatement") ||
          isType(node, "BreakStatement") ||
          isType(node, "ContinueStatement")) &&
          key === "label") ||
        ((isType(node, "ImportSpecifier") || isType(node, "ExportSpecifier")) &&
          (key === "local" || key === "imported" || key === "exported"))
      )
        continue;

      const value = getNodeProperty(node, key);
      if (isNodeArray(value)) {
        setNodeProperty(
          node,
          key,
          value.map((child) =>
            isNode(child)
              ? this.rewriteComponentPropReferences(child, replacements, shadowed, node, key)
              : child,
          ),
        );
      } else if (isNode(value)) {
        setNodeProperty(
          node,
          key,
          this.rewriteComponentPropReferences(value, replacements, shadowed, node, key),
        );
      }
    }
    return node;
  }

  private getForIndexName(parameter: Node | null | undefined): string | null {
    if (isIdentifier(parameter)) return parameter.name;
    if (isAssignmentPattern(parameter) && isIdentifier(parameter.left)) return parameter.left.name;
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
    if (isRestElement(node)) return this.collectBindingNames(node.argument, names);
    if (isAssignmentPattern(node)) return this.collectBindingNames(node.left, names);
    if (isObjectPattern(node)) {
      for (const property of node.properties) {
        if (isRestElement(property)) this.collectBindingNames(property.argument, names);
        else if (isType(property, "Property")) this.collectBindingNames(property.value, names);
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
    for (const parameter of parameters) this.collectBindingNames(parameter, shadowed);
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
    for (const parameter of parameters) this.collectBindingNames(parameter, shadowed);
    this.activeForIndexNames = previous.filter((name) => !shadowed.has(name));
    try {
      return callback();
    } finally {
      this.activeForIndexNames = previous;
    }
  }

  private transformForIndexReference(expression: ExpressionNode): ExpressionNode {
    if (!isIdentifier(expression) || !this.activeForIndexNames.includes(expression.name))
      return expression;
    const result = memberExpression(identifier(expression.name), identifier("value"));
    this.generatedForIndexReferences.add(result);
    return result;
  }

  private isRuntimeHelperCall(expression: Node, name: RuntimeHelperName): boolean {
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

  private isIfExpression(expression: Node): boolean {
    return this.isRuntimeHelperCall(expression, "$if");
  }

  private isNodesExpression(expression: Node): boolean {
    return this.isRuntimeHelperCall(expression, "$nodes");
  }

  private containsJSXInReturns(node: Node | null | undefined): boolean {
    if (!node || isFunctionLike(node)) return false;
    if (isReturnStatement(node)) return this.containsJSX(node.argument);

    for (const key of getVisitorKeys(node)) {
      if (this.isTypeOnlyPropRewriteKey(key)) continue;
      const value = getNodeProperty(node, key);

      if (isNodeArray(value)) {
        for (const child of value) {
          if (isNode(child) && this.containsJSXInReturns(child)) return true;
        }
      } else if (isNode(value) && this.containsJSXInReturns(value)) {
        return true;
      }
    }
    return false;
  }

  private containsJSX(node: Node | null | undefined): boolean {
    if (!node) return false;
    if (isJSXElement(node) || isJSXFragment(node)) return true;
    if (isCallExpression(node) && this.isJSXMapExpression(node)) return true;
    if (isFunctionLike(node)) return false;
    for (const key of getVisitorKeys(node)) {
      const value = getNodeProperty(node, key);
      if (isNodeArray(value)) {
        for (const child of value) if (isNode(child) && this.containsJSX(child)) return true;
      } else if (isNode(value) && this.containsJSX(value)) return true;
    }
    return false;
  }

  private mapCallbackReturnsJSX(callback: Node): boolean {
    if (!isArrowFunctionExpression(callback) && !isFunctionExpression(callback)) return false;
    if (callback.async || callback.generator) return false;

    return isBlockStatement(callback.body)
      ? this.containsJSXInReturns(callback.body)
      : this.containsJSX(callback.body);
  }

  private isJSXMapExpression(expression: Node): boolean {
    if (
      !isCallExpression(expression) ||
      expression.arguments.length < 1 ||
      expression.arguments.some((argument) => isSpreadElement(argument))
    )
      return false;
    const callee = expression.callee;
    if (!isMemberExpression(callee)) return false;
    if (callee.computed) {
      if (!isLiteralString(callee.property) || callee.property.value !== "map") return false;
    } else if (!isIdentifier(callee.property) || callee.property.name !== "map") {
      return false;
    }
    if (this.namedMapCallbacks.has(expression)) return true;

    const callback = expression.arguments[0];
    return isExpression(callback) && this.mapCallbackReturnsJSX(callback);
  }

  private createArrayIdentityFor(array: ExpressionNode): ExpressionNode {
    const item = this.generateUidIdentifier("item");
    const result = callExpression(this.getRuntimeHelper("$for"), [
      arrowFunctionExpression([], array),
      arrowFunctionExpression([item], cloneNode(item)),
    ]);
    this.generatedForExpressions.add(result);
    return result;
  }

  private createMapFor(
    expression: NodeOfType<"CallExpression">,
    allocator: IdentifierAllocator,
  ): ExpressionNode {
    const callee = expression.callee;
    if (!isMemberExpression(callee)) throw new Error("Vynn `$for` requires a `.map()` call.");
    const source = callee.object;
    const callback = expression.arguments[0];
    if (!isExpression(source)) throw new Error("Vynn `$for` map source must be an expression.");
    if (!isExpression(callback)) throw new Error("Vynn `$for` requires a map callback expression.");

    const transformedSource = this.transformEmbeddedExpression(source, allocator);

    // Named callbacks use a specialized sibling so ordinary calls to the
    // original function continue receiving ordinary numeric map indices.
    const namedCallback = this.namedMapCallbacks.get(expression);
    let transformedCallback: Node;

    if (namedCallback) {
      transformedCallback = cloneNode(namedCallback);
    } else {
      if (!isArrowFunctionExpression(callback) && !isFunctionExpression(callback)) {
        throw new Error("Vynn `$for` requires a function callback.");
      }

      transformedCallback = this.withForCallback(callback.params, () => {
        if (isArrowFunctionExpression(callback)) {
          const callbackBody = callback.body;
          if (isBlockStatement(callbackBody)) {
            setNodeProperty(
              callback,
              "body",
              this.transformBlockStatement(callbackBody, allocator),
            );
          } else if (isExpression(callbackBody)) {
            setNodeProperty(
              callback,
              "body",
              this.transformEmbeddedExpression(callbackBody, allocator),
            );
          }
        } else {
          setNodeProperty(callback, "body", this.transformBlockStatement(callback.body, allocator));
        }
        return callback;
      });
    }

    if (expression.arguments.length > 1) {
      const thisArg = expression.arguments[1];
      if (isExpression(thisArg)) {
        transformedCallback = callExpression(
          memberExpression(transformedCallback, identifier("bind")),
          [this.transformEmbeddedExpression(thisArg, allocator)],
        );
      }
    }

    const result = callExpression(this.getRuntimeHelper("$for"), [
      arrowFunctionExpression([], transformedSource),
      transformedCallback,
    ]);
    this.generatedForExpressions.add(result);
    return result;
  }

  private transformStatementContextExpression(
    expression: ExpressionNode,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions = false,
  ): ExpressionNode {
    if (isJSXElement(expression)) {
      if (isComponentElement(expression)) return this.createComponentCall(expression, allocator);

      const tagName = getJSXIdentifierName(expression.openingElement.name);
      const hoistedHead = this.isHoistableHeadElement(expression, tagName);

      if (!hoistedHead) {
        const template = this.createTemplateExpression(expression, allocator, statements);
        if (template) return template;
      }

      const element = this.createElementStatements(expression, statements, allocator);
      return hoistedHead ? arrayExpression([]) : element;
    }
    if (isJSXFragment(expression)) {
      return this.createFragmentInStatements(expression, allocator, statements, dynamicExpressions);
    }
    return this.transformEmbeddedExpression(expression, allocator);
  }

  private createFragmentInStatements(
    fragment: NodeOfType<"JSXFragment">,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions = false,
  ): ExpressionNode {
    const children = this.collectFragmentChildrenInStatements(
      fragment,
      allocator,
      statements,
      dynamicExpressions,
    );
    return children.length === 1 ? children[0] : arrayExpression(children);
  }

  private collectFragmentChildrenInStatements(
    fragment: NodeOfType<"JSXFragment">,
    allocator: IdentifierAllocator,
    statements: Node[],
    dynamicExpressions: boolean,
  ): ExpressionNode[] {
    const children: ExpressionNode[] = [];
    for (const child of fragment.children) {
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
  ): ExpressionNode | null {
    if (isJSXElement(child)) {
      if (isComponentElement(child)) return this.createComponentCall(child, allocator);
      return this.createElement(child, allocator);
    }
    if (isJSXText(child)) {
      const text = normalizeJSXText(child.value);
      return text
        ? callExpression(this.getRuntimeHelper("$text"), [stringLiteral(text)])
        : null;
    }
    if (isJSXExpressionContainer(child)) {
      const expression = child.expression;
      if (isJSXEmptyExpression(expression)) return null;
      if (isExpression(expression)) {
        if (isStringLiteral(expression)) {
          return callExpression(this.getRuntimeHelper("$text"), [
            stringLiteral(expression.value),
          ]);
        }
        const transformed = this.transformEmbeddedExpression(expression, allocator);
        if (
          dynamicExpressions &&
          !this.isForExpression(transformed) &&
          !this.isIfExpression(transformed) &&
          !this.isNodesExpression(transformed)
        )
          return this.createDynamicExpression(transformed);
        return transformed;
      }
      return null;
    }
    if (isJSXFragment(child)) {
      return this.createFragmentInStatements(child, allocator, statements, dynamicExpressions);
    }
    return null;
  }

  private createNestedFragment(
    fragment: NodeOfType<"JSXFragment">,
    allocator: IdentifierAllocator,
    dynamicExpressions = false,
  ): ExpressionNode {
    const children = this.collectFragmentChildrenForExpression(
      fragment,
      allocator,
      dynamicExpressions,
    );
    return children.length === 1 ? children[0] : arrayExpression(children);
  }

  private collectFragmentChildrenForExpression(
    fragment: NodeOfType<"JSXFragment">,
    allocator: IdentifierAllocator,
    dynamicExpressions: boolean,
  ): ExpressionNode[] {
    const children: ExpressionNode[] = [];
    for (const child of fragment.children) {
      if (isJSXFragment(child)) {
        children.push(
          ...this.collectFragmentChildrenForExpression(child, allocator, dynamicExpressions),
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
  ): ExpressionNode | null {
    if (isJSXElement(child)) {
      return isComponentElement(child)
        ? this.createComponentCall(child, allocator)
        : this.createElement(child, allocator);
    }
    if (isJSXText(child)) {
      const text = normalizeJSXText(child.value);
      return text
        ? callExpression(this.getRuntimeHelper("$text"), [stringLiteral(text)])
        : null;
    }
    if (isJSXExpressionContainer(child)) {
      const expression = child.expression;
      if (isJSXEmptyExpression(expression)) return null;
      if (isExpression(expression)) {
        if (isStringLiteral(expression)) {
          return callExpression(this.getRuntimeHelper("$text"), [
            stringLiteral(expression.value),
          ]);
        }
        const transformed = this.transformEmbeddedExpression(expression, allocator);
        if (
          dynamicExpressions &&
          !this.isForExpression(transformed) &&
          !this.isIfExpression(transformed) &&
          !this.isNodesExpression(transformed)
        )
          return this.createDynamicExpression(transformed);
        return transformed;
      }
      return null;
    }
    if (isJSXFragment(child))
      return this.createNestedFragment(child, allocator, dynamicExpressions);
    return null;
  }

  /**
   * Creates a shared static template factory and emits semantic child/sibling
   * navigation for each dynamic binding. The factory receives no render or bind
   * callback; it only creates the template's static node tree.
   *
   * Component returns can emit setup statements beside the return. Expression
   * contexts use a small IIFE to keep the generated references instance-local.
   */
  private createTemplateExpression(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
    outerStatements?: Node[],
  ): ExpressionNode | null {
    const serialized = this.serializeTemplate(node);
    if (!serialized) return null;

    const { markup, bindings } = serialized;
    const existingTemplate = this.templateFactories.get(markup);
    const templateName = existingTemplate ?? this.generateUidIdentifier("tmpl");

    if (!existingTemplate) {
      this.templateStatements.push(
        variableDeclaration("const", [
          variableDeclarator(
            templateName,
            callExpression(this.getRuntimeHelper("$template"), [stringLiteral(markup)]),
          ),
        ]),
      );
      this.templateFactories.set(markup, templateName);
    }

    if (bindings.length === 0) {
      return inheritSourceLocation(callExpression(cloneNode(templateName), []), node);
    }

    const statements = outerStatements ?? [];
    const root = this.generateUidIdentifier("root");

    statements.push(
      variableDeclaration("const", [
        variableDeclarator(root, callExpression(cloneNode(templateName), [])),
      ]),
    );

    const references = new Map<string, NodeOfType<"Identifier">>();
    references.set("[]", root);

    const getReference = (path: number[]): NodeOfType<"Identifier"> => {
      const key = JSON.stringify(path);
      const existing = references.get(key);
      if (existing) return existing;

      const parentPath = path.slice(0, -1);
      const parent = getReference(parentPath);
      const index = path[path.length - 1];
      const previous = index > 0 ? getReference([...parentPath, index - 1]) : undefined;
      const reference = allocator.nextElement();
      const navigation = previous
        ? callExpression(this.getRuntimeHelper("$sibling"), [cloneNode(previous)])
        : callExpression(this.getRuntimeHelper("$child"), [cloneNode(parent)]);

      statements.push(
        variableDeclaration("const", [variableDeclarator(reference, navigation)]),
      );
      references.set(key, reference);

      return reference;
    };

    for (const binding of bindings) {
      if (binding.kind === "title") {
        if (!isJSXElement(binding.node)) continue;

        const target = getReference(binding.path);
        const content = this.createTitleContentExpression(binding.node, allocator);
        statements.push(expressionStatement(this.createInsert(target, content)));
        continue;
      }

      if (binding.kind === "child") {
        let child: ExpressionNode;

        if (isJSXElement(binding.node)) {
          child = this.createComponentCall(binding.node, allocator);
        } else if (
          isJSXExpressionContainer(binding.node) &&
          isExpression(binding.node.expression)
        ) {
          child = this.transformEmbeddedExpression(binding.node.expression, allocator);
        } else {
          continue;
        }

        const parent = getReference(binding.path.slice(0, -1));
        const slot = allocator.nextElement();

        if (!binding.slot) {
          throw new Error("[vynn compiler]: A dynamic child binding is missing its slot id.");
        }

        statements.push(
          variableDeclaration("const", [
            variableDeclarator(
              slot,
              this.createInsert(parent, child, binding.slot),
            ),
          ]),
        );
        references.set(JSON.stringify(binding.path), slot);
        continue;
      }

      const target = getReference(binding.path);

      if (binding.kind === "spread") {
        if (!isJSXSpreadAttribute(binding.node)) continue;

        statements.push(
          expressionStatement(
            this.createSpreadAttribute(
              target,
              this.transformEmbeddedExpression(binding.node.argument, allocator),
            ),
          ),
        );
        continue;
      }

      if (!isJSXAttribute(binding.node)) continue;

      const name = getJSXAttributeName(binding.node.name);
      const value = binding.node.value;

      if (name === "ref") {
        if (
          isJSXExpressionContainer(value) &&
          !isJSXEmptyExpression(value.expression) &&
          isExpression(value.expression)
        ) {
          statements.push(
            ...this.createRef(
              target,
              this.transformEmbeddedExpression(value.expression, allocator),
            ),
          );
        }
        continue;
      }

      const event = this.getEventAttribute(name);

      if (event) {
        if (isJSXExpressionContainer(value) && isExpression(value.expression)) {
          statements.push(
            expressionStatement(
              this.createEvent(
                target,
                event.name,
                this.transformEmbeddedExpression(value.expression, allocator),
                event.capture,
              ),
            ),
          );
        }
        continue;
      }

      if (isJSXExpressionContainer(value) && isExpression(value.expression)) {
        statements.push(
          expressionStatement(
            this.createAttribute(
              target,
              name,
              this.transformEmbeddedExpression(value.expression, allocator),
            ),
          ),
        );
      }
    }

    statements.push(
      expressionStatement(
        callExpression(this.getRuntimeHelper("$finishTemplate"), [cloneNode(root)]),
      ),
    );

    if (outerStatements) {
      return inheritSourceLocation(cloneNode(root), node);
    }

    statements.push(returnStatement(cloneNode(root)));

    return inheritSourceLocation(
      callExpression(arrowFunctionExpression([], blockStatement(statements)), []),
      node,
    );
  }

  /**
   * Compiles the complete contents of a dynamic <title> as one text binding.
   * HTML parses title contents as RCDATA, so comment anchors would become
   * visible text instead of DOM comments.
   */
  private createTitleContentExpression(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
  ): ExpressionNode {
    const children: ExpressionNode[] = [];

    const appendChild = (child: Node): void => {
      if (isJSXText(child)) {
        const text = normalizeJSXText(child.value);
        if (text) children.push(stringLiteral(text));
        return;
      }

      if (isJSXFragment(child)) {
        for (const nested of child.children) appendChild(nested);
        return;
      }

      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (isJSXEmptyExpression(expression) || !isExpression(expression)) return;

        if (
          isType(expression, "Literal") &&
          (typeof expression.value === "string" || typeof expression.value === "number")
        ) {
          children.push(stringLiteral(String(expression.value)));
          return;
        }

        children.push(this.transformEmbeddedExpression(expression, allocator));
        return;
      }

      if (isJSXElement(child)) {
        children.push(
          isComponentElement(child)
            ? this.createComponentCall(child, allocator)
            : this.createElement(child, allocator),
        );
      }
    };

    for (const child of node.children) appendChild(child);

    return arrayExpression(children);
  }

  /**
   * Converts supported host JSX into a static HTML template string. Dynamic
   * children use compact Vynn HTML comment anchors, except <title> content,
   * which is compiled as one text binding because title uses HTML RCDATA mode.
   * Binding paths are used only while generating $child() and $sibling() navigation.
   */
  private serializeTemplate(
    node: NodeOfType<"JSXElement">,
  ):
    | {
        markup: string;
        bindings: TemplateBinding[];
      }
    | undefined {
    const booleanAttributes = new Set([
      "allowfullscreen",
      "async",
      "autofocus",
      "autoplay",
      "checked",
      "controls",
      "default",
      "defer",
      "disabled",
      "formnovalidate",
      "hidden",
      "inert",
      "ismap",
      "itemscope",
      "loop",
      "multiple",
      "muted",
      "nomodule",
      "novalidate",
      "open",
      "playsinline",
      "readonly",
      "required",
      "reversed",
      "selected",
    ]);

    const attributeAliases: Record<string, string> = {
      autoCapitalize: "autocapitalize",
      className: "class",
      colSpan: "colspan",
      contentEditable: "contenteditable",
      enterKeyHint: "enterkeyhint",
      htmlFor: "for",
      inputMode: "inputmode",
      rowSpan: "rowspan",
      tabIndex: "tabindex",
      xlinkActuate: "xlink:actuate",
      xlinkArcrole: "xlink:arcrole",
      xlinkHref: "xlink:href",
      xlinkRole: "xlink:role",
      xlinkShow: "xlink:show",
      xlinkTitle: "xlink:title",
      xlinkType: "xlink:type",
      xmlBase: "xml:base",
      xmlLang: "xml:lang",
      xmlSpace: "xml:space",
      xmlnsXlink: "xmlns:xlink",
    };

    const preservedSVGAttributes = new Set([
      "attributeName",
      "attributeType",
      "baseFrequency",
      "baseProfile",
      "calcMode",
      "contentScriptType",
      "contentStyleType",
      "diffuseConstant",
      "externalResourcesRequired",
      "filterRes",
      "filterUnits",
      "gradientTransform",
      "gradientUnits",
      "kernelMatrix",
      "kernelUnitLength",
      "keyPoints",
      "keySplines",
      "keyTimes",
      "lengthAdjust",
      "limitingConeAngle",
      "markerHeight",
      "markerUnits",
      "markerWidth",
      "numOctaves",
      "pathLength",
      "patternContentUnits",
      "patternTransform",
      "patternUnits",
      "preserveAspectRatio",
      "primitiveUnits",
      "refX",
      "refY",
      "specularConstant",
      "specularExponent",
      "stdDeviation",
      "surfaceScale",
      "targetX",
      "targetY",
      "textLength",
      "viewBox",
      "viewTarget",
      "xChannelSelector",
      "yChannelSelector",
    ]);

    const voidElements = new Set([
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ]);

    const unsupportedContextElements = new Set([
      "col",
      "colgroup",
      "iframe",
      "noembed",
      "noframes",
      "noscript",
      "option",
      "optgroup",
      "plaintext",
      "pre",
      "listing",
      "html",
      "head",
      "body",
      "script",
      "select",
      "style",
      "template",
      "textarea",
      "title",
      "xmp",
    ]);

    const isDocumentRoot =
      getJSXIdentifierName(node.openingElement.name).toLowerCase() === "html";
    const tableSections = new Set(["thead", "tbody", "tfoot"]);
    const isValidTableContext = (tag: string, parentTag: string | null): boolean => {
      if (tag === "table") {
        return (
          parentTag !== "table" &&
          !tableSections.has(parentTag ?? "") &&
          parentTag !== "tr"
        );
      }
      if (tableSections.has(tag)) return parentTag === "table";
      if (tag === "tr") return tableSections.has(parentTag ?? "");
      if (tag === "td" || tag === "th") return parentTag === "tr";
      if (parentTag === "table") return false;
      if (tableSections.has(parentTag ?? "")) return false;
      if (parentTag === "tr") return false;
      return true;
    };
    const bindings: TemplateBinding[] = [];
    let anchorIndex = 0;

    type SerializedNodes = {
      markup: string;
      nodes: TemplateNodeShape[];
    };

    const appendNode = (
      nodes: TemplateNodeShape[],
      nodeToAppend: TemplateNodeShape,
    ): void => {
      const previous = nodes[nodes.length - 1];

      if (
        previous?.kind === "text" &&
        nodeToAppend.kind === "text" &&
        previous.value !== "" &&
        nodeToAppend.value !== ""
      ) {
        previous.value += nodeToAppend.value;
        return;
      }

      nodes.push(nodeToAppend);
    };

    const hasDynamicTitleChild = (child: Node): boolean => {
      if (isJSXText(child)) return false;

      if (isJSXFragment(child)) {
        return child.children.some(hasDynamicTitleChild);
      }

      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (isJSXEmptyExpression(expression)) return false;

        return !(
          isType(expression, "Literal") &&
          (typeof expression.value === "string" || typeof expression.value === "number")
        );
      }

      return isJSXElement(child);
    };

    const serialize = (
      current: Node,
      path: number[],
      siblings?: TemplateNodeShape[],
      parentTag: string | null = null,
    ): SerializedNodes | undefined => {
      if (isJSXText(current)) {
        const value = normalizeJSXText(current.value);
        if (!value) return { markup: "", nodes: [] };
        if (
          parentTag === "table" ||
          parentTag === "thead" ||
          parentTag === "tbody" ||
          parentTag === "tfoot" ||
          parentTag === "tr"
        ) {
          return undefined;
        }

        const descriptor: TemplateNodeShape = { kind: "text", value };
        if (siblings) appendNode(siblings, descriptor);

        return {
          markup: this.escapeStaticText(value),
          nodes: siblings ? [] : [descriptor],
        };
      }

      if (isJSXFragment(current)) {
        const nodes = siblings ?? [];
        let markup = "";

        for (const child of current.children) {
          const index = nodes.length;
          const childPath = siblings
            ? [...path.slice(0, -1), index]
            : [...path, index];
          const childResult = serialize(child, childPath, nodes, parentTag);
          if (!childResult) return undefined;

          markup += childResult.markup;
        }

        return { markup, nodes: siblings ? [] : nodes };
      }

      if (isJSXExpressionContainer(current)) {
        const expression = current.expression;
        if (isJSXEmptyExpression(expression)) return { markup: "", nodes: [] };
        if (parentTag === "table" || parentTag === "tr") return undefined;

        if (
          isType(expression, "Literal") &&
          (typeof expression.value === "string" || typeof expression.value === "number")
        ) {
          const value = String(expression.value);
          const descriptor: TemplateNodeShape = { kind: "text", value };
          if (siblings) appendNode(siblings, descriptor);

          return {
            markup: value === "" ? "<!--$0-->" : this.escapeStaticText(value),
            nodes: siblings ? [] : [descriptor],
          };
        }

        const id = String(anchorIndex++);
        const isTitleSlot = parentTag === "title";
        const startDescriptor: TemplateNodeShape = {
          kind: "anchor",
          id: "start-" + id,
        };
        const descriptor: TemplateNodeShape = { kind: "anchor", id };
        const bindingPath =
          isTitleSlot && path.length > 0
            ? [...path.slice(0, -1), path[path.length - 1] + 1]
            : path;

        bindings.push({ kind: "child", path: bindingPath, node: current, slot: id });
        if (siblings) {
          if (isTitleSlot) appendNode(siblings, startDescriptor);
          appendNode(siblings, descriptor);
        }

        return {
          markup:
            (isTitleSlot ? "<!--$vs" + id + "-->" : "") +
            "<!--$v" +
            id +
            "-->",
          nodes: siblings ? [] : isTitleSlot ? [startDescriptor, descriptor] : [descriptor],
        };
      }

      if (!isJSXElement(current)) return undefined;

      if (isComponentElement(current)) {
        if (parentTag === "table") return undefined;

        const id = String(anchorIndex++);
        const isTitleSlot = parentTag === "title";
        const startDescriptor: TemplateNodeShape = {
          kind: "anchor",
          id: "start-" + id,
        };
        const descriptor: TemplateNodeShape = { kind: "anchor", id };
        const bindingPath =
          isTitleSlot && path.length > 0
            ? [...path.slice(0, -1), path[path.length - 1] + 1]
            : path;

        bindings.push({ kind: "child", path: bindingPath, node: current, slot: id });
        if (siblings) {
          if (isTitleSlot) appendNode(siblings, startDescriptor);
          appendNode(siblings, descriptor);
        }

        return {
          markup:
            (isTitleSlot ? "<!--$vs" + id + "-->" : "") +
            "<!--$v" +
            id +
            "-->",
          nodes: siblings ? [] : isTitleSlot ? [startDescriptor, descriptor] : [descriptor],
        };
      }

      const tagName = getJSXIdentifierName(current.openingElement.name);
      const lowerTagName = tagName.toLowerCase();

      const isDocumentContextElement =
        isDocumentRoot &&
        ((lowerTagName === "html" && current === node) ||
          ((lowerTagName === "head" || lowerTagName === "body") && parentTag === "html") ||
          (lowerTagName === "title" && parentTag === "head"));

      if (
        !/^[a-z][A-Za-z0-9._-]*$/.test(tagName) ||
        (unsupportedContextElements.has(lowerTagName) && !isDocumentContextElement) ||
        !isValidTableContext(lowerTagName, parentTag) ||
        this.isHoistableHeadElement(current, tagName)
      ) {
        return undefined;
      }

      const markupAttributes: string[] = [];
      const staticAttributes: Array<[string, string]> = [];

      for (const attribute of current.openingElement.attributes) {
        if (isJSXSpreadAttribute(attribute)) {
          bindings.push({ kind: "spread", path: [...path], node: attribute });
          continue;
        }

        if (!isJSXAttribute(attribute)) return undefined;

        const sourceName = getJSXAttributeName(attribute.name);
        const lowerName = sourceName.toLowerCase();

        if (
          lowerName === "html" ||
          lowerName.startsWith("data-vynn-bind-") ||
          !/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(sourceName)
        ) {
          return undefined;
        }

        const eventAttribute = this.getEventAttribute(sourceName);

        if (
          /[A-Z]/.test(sourceName) &&
          !(sourceName in attributeAliases) &&
          !preservedSVGAttributes.has(sourceName) &&
          !this.svgDescendants.has(current) &&
          !eventAttribute
        ) {
          return undefined;
        }

        if (sourceName === "ref") {
          if (
            isJSXExpressionContainer(attribute.value) &&
            !isJSXEmptyExpression(attribute.value.expression) &&
            isExpression(attribute.value.expression)
          ) {
            bindings.push({ kind: "attribute", path: [...path], node: attribute });
          }
          continue;
        }

        if (eventAttribute) {
          if (
            isJSXExpressionContainer(attribute.value) &&
            isExpression(attribute.value.expression)
          ) {
            bindings.push({ kind: "attribute", path: [...path], node: attribute });
          }
          continue;
        }

        const attributeName =
          attributeAliases[sourceName] ??
          (this.svgDescendants.has(current) && !preservedSVGAttributes.has(sourceName)
            ? sourceName.replace(/[A-Z]/g, (character) => "-" + character.toLowerCase())
            : this.svgDescendants.has(current)
              ? sourceName
              : sourceName.toLowerCase());
        let rawValue: string | number | boolean | null | undefined;

        if (attribute.value === null) {
          rawValue = true;
        } else if (isLiteralString(attribute.value)) {
          rawValue = attribute.value.value;
        } else if (isJSXExpressionContainer(attribute.value)) {
          const expression = attribute.value.expression;
          if (isJSXEmptyExpression(expression)) continue;

          if (
            isType(expression, "Literal") &&
            (expression.value === null ||
              typeof expression.value === "string" ||
              typeof expression.value === "number" ||
              typeof expression.value === "boolean")
          ) {
            rawValue = expression.value as string | number | boolean | null;
          } else {
            bindings.push({ kind: "attribute", path: [...path], node: attribute });
            continue;
          }
        } else {
          continue;
        }

        if (booleanAttributes.has(lowerName)) {
          if (!rawValue) continue;
          rawValue = "";
        }

        if (rawValue != null) {
          const value = String(rawValue);
          staticAttributes.push([attributeName, value]);
          markupAttributes.push(
            attributeName + '="' + this.escapeStaticAttribute(value) + '"',
          );
        }
      }

      const children: TemplateNodeShape[] = [];
      let childMarkup = "";
      const hasDynamicTitleContent =
        lowerTagName === "title" && current.children.some(hasDynamicTitleChild);

      if (hasDynamicTitleContent) {
        bindings.push({ kind: "title", path: [...path], node: current });
      } else {
        for (let childIndex = 0; childIndex < current.children.length; ) {
          const child = current.children[childIndex];

          // HTML fragment parsing inserts <tbody> around direct <tr> children.
          // Emit that wrapper in both the markup and descriptor so SSR and hydration
          // navigate the same node paths.
          if (
            lowerTagName === "table" &&
            isJSXElement(child) &&
            getJSXIdentifierName(child.openingElement.name).toLowerCase() === "tr"
          ) {
            const tbodyChildren: TemplateNodeShape[] = [];
            const tbodyPath = [...path, children.length];
            let tbodyMarkup = "";

            while (childIndex < current.children.length) {
              const row = current.children[childIndex];

              if (isJSXText(row) && !normalizeJSXText(row.value)) {
                childIndex++;
                continue;
              }

              if (
                !isJSXElement(row) ||
                getJSXIdentifierName(row.openingElement.name).toLowerCase() !== "tr"
              ) {
                break;
              }

              const rowResult = serialize(
                row,
                [...tbodyPath, tbodyChildren.length],
                tbodyChildren,
                "tbody",
              );
              if (!rowResult) return undefined;

              tbodyMarkup += rowResult.markup;
              childIndex++;
            }

            children.push({
              kind: "element",
              tag: "tbody",
              attributes: [],
              children: tbodyChildren,
            });
            childMarkup += "<tbody>" + tbodyMarkup + "</tbody>";
            continue;
          }

          const childResult = serialize(
            child,
            [...path, children.length],
            children,
            lowerTagName,
          );
          if (!childResult) return undefined;

          childMarkup += childResult.markup;
          childIndex++;
        }
      }

      const opening =
        "<" + tagName + (markupAttributes.length ? " " + markupAttributes.join(" ") : "") + ">";
      const element: TemplateNodeShape = {
        kind: "element",
        tag: tagName,
        attributes: staticAttributes,
        children: voidElements.has(lowerTagName) ? [] : children,
      };

      if (voidElements.has(lowerTagName) && children.length > 0) return undefined;

      if (siblings) appendNode(siblings, element);

      const markup = voidElements.has(lowerTagName)
        ? opening
        : opening + childMarkup + "</" + tagName + ">";

      return { markup, nodes: siblings ? [] : [element] };
    };

    const result = serialize(node, [], undefined, null);

    if (!result || result.nodes.length !== 1 || result.nodes[0].kind !== "element") {
      return undefined;
    }

    if (isDocumentRoot) {
      const children = result.nodes[0].children.filter(
        (child): child is Extract<TemplateNodeShape, { kind: "element" }> =>
          child.kind === "element",
      );
      const heads = children.filter((child) => child.tag.toLowerCase() === "head");
      const bodies = children.filter((child) => child.tag.toLowerCase() === "body");

      if (heads.length !== 1 || bodies.length !== 1) {
        throw new Error(
          "[Vynn compiler] A complete <html> document must contain exactly one direct <head> and one direct <body>.",
        );
      }
    }

    return {
      markup: result.markup,
      bindings,
    };
  }

  private escapeStaticText(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private escapeStaticAttribute(value: string): string {
    return this.escapeStaticText(value).replace(/"/g, "&quot;");
  }

  /**
   * Creates the instance-local setup for a hoisted template using native
   * sibling walks. Unsupported parsing contexts use regular JSX lowering.
   */
  private createElement(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
    outerStatements?: Node[],
  ): ExpressionNode {
    if (this.isHeadGroupElement(node)) {
      return inheritSourceLocation(this.createHeadGroupExpression(node, allocator), node);
    }

    // When the caller already owns a statement list, emit template setup into
    // that scope instead of creating an expression-level IIFE.
    const templateStatements = outerStatements ?? [];
    const template = this.createTemplateExpression(node, allocator, templateStatements);

    if (template) {
      if (outerStatements) return template;
      if (templateStatements.length === 0) return template;

      templateStatements.push(returnStatement(template));
      return inheritSourceLocation(
        callExpression(arrowFunctionExpression([], blockStatement(templateStatements)), []),
        node,
      );
    }

    const statements = outerStatements ?? [];
    const tagName = getJSXIdentifierName(node.openingElement.name);
    const hoistedHead = this.isHoistableHeadElement(node, tagName);
    const elementId = this.createElementStatements(node, statements, allocator);

    if (outerStatements) return hoistedHead ? arrayExpression([]) : elementId;

    statements.push(returnStatement(hoistedHead ? arrayExpression([]) : elementId));
    return inheritSourceLocation(
      callExpression(arrowFunctionExpression([], blockStatement(statements)), []),
      node,
    );
  }

  private createHeadGroupExpression(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
  ): ExpressionNode {
    const entries: ExpressionNode[] = [];

    const collect = (child: Node): void => {
      if (isJSXText(child) || isJSXEmptyExpression(child)) return;

      if (isJSXFragment(child)) {
        for (const nested of child.children) collect(nested);
        return;
      }

      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (!isJSXEmptyExpression(expression) && isExpression(expression)) {
          entries.push(this.transformEmbeddedExpression(expression, allocator));
        }
        return;
      }

      if (!isJSXElement(child)) return;

      if (isComponentElement(child)) {
        entries.push(this.createComponentCall(child, allocator));
        return;
      }

      const tagName = getJSXIdentifierName(child.openingElement.name);
      if (this.isHoistableHeadElement(child, tagName)) {
        entries.push(
          callExpression(this.getRuntimeHelper("$registerHead"), [
            stringLiteral(tagName),
            arrowFunctionExpression([], this.createHeadProps(child, allocator)),
          ]),
        );
        return;
      }

      throw new Error(
        `[Vynn] A nested <head> group only accepts <title>, <meta>, <link>, fragments, and components. Received <${tagName}>.`,
      );
    };

    for (const child of node.children) collect(child);

    return callExpression(this.getRuntimeHelper("$registerHeadGroup"), [
      arrowFunctionExpression([], arrayExpression(entries)),
    ]);
  }

  private createHeadProps(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
  ): Node {
    const properties: Node[] = [];

    for (const attribute of node.openingElement.attributes) {
      if (isJSXSpreadAttribute(attribute)) {
        properties.push(
          spreadElement(this.transformEmbeddedExpression(attribute.argument, allocator)),
        );
        continue;
      }

      if (!isJSXAttribute(attribute)) continue;

      const name = getJSXAttributeName(attribute.name);
      if (name === "ref") continue;

      if (isLiteralString(attribute.value)) {
        properties.push(
          objectMethod(
            "get",
            propertyKey(name),
            [],
            blockStatement([returnStatement(stringLiteral(attribute.value.value))]),
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

    const children: Node[] = [];
    const collectText = (child: Node): void => {
      if (isJSXText(child)) {
        const text = normalizeJSXText(child.value);
        if (text) children.push(stringLiteral(text));
        return;
      }

      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (!isJSXEmptyExpression(expression) && isExpression(expression)) {
          children.push(this.transformEmbeddedExpression(expression, allocator));
        }
        return;
      }

      if (isJSXFragment(child)) {
        for (const nested of child.children) collectText(nested);
        return;
      }

      if (isJSXElement(child)) {
        if (isComponentElement(child)) {
          children.push(this.createComponentCall(child, allocator));
        } else {
          // Head content is text. Preserve the text of nested formatting tags
          // without constructing body DOM for markup that cannot live in <head>.
          for (const nested of child.children) collectText(nested);
        }
      }
    };

    for (const child of node.children) collectText(child);

    if (children.length > 0) {
      const value = children.length === 1 ? children[0] : arrayExpression(children);
      properties.push(
        objectMethod(
          "get",
          identifier("children"),
          [],
          blockStatement([returnStatement(value)]),
        ),
      );
    }

    return objectExpression(properties);
  }

  private createElementTemplateMarkup(tagName: string): string {
    const voidTags = new Set([
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ]);
    return voidTags.has(tagName.toLowerCase())
      ? `<${tagName}>`
      : `<${tagName}></${tagName}>`;
  }

  private createElementStatements(
    node: NodeOfType<"JSXElement">,
    statements: Node[],
    allocator: IdentifierAllocator,
  ): NodeOfType<"Identifier"> {
    const tagName = getJSXIdentifierName(node.openingElement.name);
    const hoistToHead = this.isHoistableHeadElement(node, tagName);
    const elementId = allocator.nextElement();

    if (hoistToHead) {
      statements.push(
        variableDeclaration("const", [
          variableDeclarator(
            elementId,
            callExpression(this.getRuntimeHelper("$registerHead"), [
              stringLiteral(tagName),
              arrowFunctionExpression([], this.createHeadProps(node, allocator)),
            ]),
          ),
        ]),
      );
      return elementId;
    }

    const markup = this.createElementTemplateMarkup(tagName);
    const existingTemplate = this.templateFactories.get(markup);
    const templateName = existingTemplate ?? this.generateUidIdentifier("tmpl");

    if (!existingTemplate) {
      this.templateStatements.push(
        variableDeclaration("const", [
          variableDeclarator(
            templateName,
            callExpression(this.getRuntimeHelper("$template"), [stringLiteral(markup)]),
          ),
        ]),
      );
      this.templateFactories.set(markup, templateName);
    }

    statements.push(
      variableDeclaration("const", [
        variableDeclarator(elementId, callExpression(cloneNode(templateName), [])),
      ]),
    );

    this.transformAttributes(node.openingElement, elementId, statements, allocator);
    this.transformElementChildren(node.children, elementId, statements, allocator);

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
            expressionStatement(this.createInsert(elementId, stringLiteral(text))),
          );
        continue;
      }
      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (isJSXEmptyExpression(expression) || !isExpression(expression)) continue;
        const childExpression = isStringLiteral(expression)
          ? stringLiteral(expression.value)
          : this.transformEmbeddedExpression(expression, allocator);
        statements.push(expressionStatement(this.createInsert(elementId, childExpression)));
        continue;
      }
      if (isJSXElement(child)) {
        const childExpression = isComponentElement(child)
          ? this.createComponentCall(child, allocator)
          : this.createElement(child, allocator);
        statements.push(expressionStatement(this.createInsert(elementId, childExpression)));
        continue;
      }
      if (isJSXFragment(child)) {
        const fragment = this.createFragmentInStatements(child, allocator, statements, false);
        statements.push(expressionStatement(this.createInsert(elementId, fragment)));
      }
    }
  }

  private createDynamicExpression(expression: ExpressionNode): ExpressionNode {
    return callExpression(this.getRuntimeHelper("$nodes"), [
      arrowFunctionExpression([], expression),
    ]);
  }

  private createRenderableDynamicExpression(expression: ExpressionNode): ExpressionNode {
    const value = this.generateUidIdentifier("logicalValue");
    const body = blockStatement([
      variableDeclaration("const", [variableDeclarator(value, expression)]),
      returnStatement(
        conditionalExpression(
          binaryExpression(
            "===",
            unaryExpression("typeof", cloneNode(value)),
            stringLiteral("boolean"),
          ),
          voidZero(),
          cloneNode(value),
        ),
      ),
    ]);

    return callExpression(this.getRuntimeHelper("$nodes"), [arrowFunctionExpression([], body)]);
  }

  /**
   * Creates a compiler-managed conditional boundary.
   *
   * Branches stay lazy. Scalar branches need their own dynamic range so
   * reactive values keep updating while that branch is active. Existing
   * control-flow helpers retain their own lifecycle and must not be wrapped
   * by another $nodes call.
   */
  private createIfExpression(
    test: ExpressionNode,
    consequent: ExpressionNode,
    alternate: ExpressionNode | null = null,
    consequentSource: ExpressionNode = consequent,
    alternateSource: ExpressionNode = alternate ?? voidZero(),
  ): ExpressionNode {
    const createBranch = (expression: ExpressionNode, source: ExpressionNode): ExpressionNode => {
      if (
        this.isForExpression(expression) ||
        this.isIfExpression(expression) ||
        this.isNodesExpression(expression) ||
        this.containsJSX(source)
      ) {
        // JSX, lists, conditionals and existing dynamic ranges already
        // produce renderable nodes; another $nodes wrapper is redundant.
        return expression;
      }

      if (isType(source, "Literal")) {
        if (typeof source.value === "string" || typeof source.value === "number") {
          // Static primitives should be text nodes, not reactive ranges.
          return stringLiteral(String(source.value));
        }

        if (typeof source.value === "boolean") {
          // Both booleans render no JSX content. Normalize true to false so
          // resolveNode never receives the unsupported JSX.Element value true.
          return booleanLiteral(false);
        }

        if (source.value === null) {
          // A static null branch cannot change reactively.
          return expression;
        }
      }

      // Unknown scalar expressions may depend on reactive state, so keep
      // them inside a dynamic range when their branch is active.
      return this.createDynamicExpression(expression);
    };

    const args = [
      arrowFunctionExpression([], test),
      arrowFunctionExpression([], createBranch(consequent, consequentSource)),
    ];

    // $if defaults the alternate to undefined. Omit the callback entirely
    // when this logical expression's false branch renders nothing.
    if (alternate !== null) {
      args.push(arrowFunctionExpression([], createBranch(alternate, alternateSource)));
    }

    const result = callExpression(this.getRuntimeHelper("$if"), args);

    this.generatedIfExpressions.add(result);
    return result;
  }

  private transformEmbeddedExpression(
    expression: ExpressionNode,
    allocator: IdentifierAllocator,
  ): ExpressionNode {
    if (isCallExpression(expression) && this.generatedForExpressions.has(expression))
      return expression;
    if (isCallExpression(expression) && this.generatedIfExpressions.has(expression))
      return expression;
    if (isMemberExpression(expression) && this.generatedForIndexReferences.has(expression))
      return expression;

    const transformedForIndex = this.transformForIndexReference(expression);
    if (transformedForIndex !== expression) return transformedForIndex;

    if (isCallExpression(expression) && this.isJSXMapExpression(expression)) {
      return inheritSourceLocation(this.createMapFor(expression, allocator), expression);
    }

    if (isArrayExpression(expression) && this.containsJSX(expression)) {
      setNodeProperty(
        expression,
        "elements",
        expression.elements.map((element) => {
          if (!element) return null;
          if (isSpreadElement(element)) {
            setNodeProperty(
              element,
              "argument",
              this.transformEmbeddedExpression(element.argument, allocator),
            );
            return element;
          }
          return isExpression(element)
            ? this.transformEmbeddedExpression(element, allocator)
            : element;
        }),
      );
      return inheritSourceLocation(this.createArrayIdentityFor(expression), expression);
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
      const sourceLeft = expression.left;
      const sourceRight = expression.right;
      const hasJSX = this.containsJSX(sourceLeft) || this.containsJSX(sourceRight);

      const left = this.transformEmbeddedExpression(sourceLeft, allocator);
      const right = this.transformEmbeddedExpression(sourceRight, allocator);

      if (hasJSX && expression.operator === "&&") {
        // A two-argument $if preserves the short-circuit result: the runtime
        // renders a falsy, non-boolean left operand when no alternate is
        // supplied, while boolean false produces no content.
        return inheritSourceLocation(
          this.createIfExpression(left, right, null, sourceRight, sourceLeft),
          expression,
        );
      }

      if (hasJSX) {
        // || and ?? can return either operand. Preserve their native JavaScript
        // result inside a dynamic range rather than adding an alternate branch
        // to $if for a logical expression.
        setNodeProperty(expression, "left", left);
        setNodeProperty(expression, "right", right);
        return inheritSourceLocation(
          this.createRenderableDynamicExpression(expression),
          expression,
        );
      }

      setNodeProperty(expression, "left", left);
      setNodeProperty(expression, "right", right);
      return expression;
    }
    if (isConditionalExpression(expression)) {
      // Keep the original branches available for deciding whether the
      // transformed result already produces JSX nodes. Transforming
      // <Fallback /> to Fallback(props) erases the JSX syntax itself.
      const consequentSource = expression.consequent;
      const alternateSource = expression.alternate;
      const hasJSX = this.containsJSX(consequentSource) || this.containsJSX(alternateSource);

      const test = this.transformEmbeddedExpression(expression.test, allocator);
      const consequent = this.transformEmbeddedExpression(consequentSource, allocator);
      const alternate = this.transformEmbeddedExpression(alternateSource, allocator);

      if (hasJSX) {
        return inheritSourceLocation(
          this.createIfExpression(test, consequent, alternate, consequentSource, alternateSource),
          expression,
        );
      }

      setNodeProperty(expression, "test", test);
      setNodeProperty(expression, "consequent", consequent);
      setNodeProperty(expression, "alternate", alternate);
      return expression;
    }
    if (isCallExpression(expression)) {
      setNodeProperty(
        expression,
        "arguments",
        expression.arguments.map((argument: Node) => {
          if (isSpreadElement(argument)) {
            setNodeProperty(
              argument,
              "argument",
              this.transformEmbeddedExpression(argument.argument, allocator),
            );
            return argument;
          }
          return isExpression(argument)
            ? this.transformEmbeddedExpression(argument, allocator)
            : argument;
        }),
      );
      return expression;
    }
    if (isArrowFunctionExpression(expression)) {
      const transformBody = () => {
        const body = expression.body;
        if (isBlockStatement(body)) {
          setNodeProperty(expression, "body", this.transformBlockStatement(body, allocator));
        } else if (isExpression(body)) {
          setNodeProperty(expression, "body", this.transformEmbeddedExpression(body, allocator));
        }
        return expression;
      };

      return this.specializedForCallbacks.has(expression)
        ? this.withForCallback(expression.params, transformBody)
        : this.withShadowedForIndices(expression.params, transformBody);
    }
    if (isFunctionExpression(expression)) {
      const transformBody = () => {
        setNodeProperty(
          expression,
          "body",
          this.transformBlockStatement(expression.body, allocator),
        );
        return expression;
      };

      return this.specializedForCallbacks.has(expression)
        ? this.withForCallback(expression.params, transformBody)
        : this.withShadowedForIndices(expression.params, transformBody);
    }
    if (isArrayExpression(expression)) {
      setNodeProperty(
        expression,
        "elements",
        expression.elements.map((element) => {
          if (!element) return null;
          if (isSpreadElement(element)) {
            setNodeProperty(
              element,
              "argument",
              this.transformEmbeddedExpression(element.argument, allocator),
            );
            return element;
          }
          return isExpression(element)
            ? this.transformEmbeddedExpression(element, allocator)
            : element;
        }),
      );
      return expression;
    }
    if (isObjectExpression(expression)) {
      setNodeProperty(
        expression,
        "properties",
        expression.properties.map((property: Node) => {
          if (isSpreadElement(property)) {
            setNodeProperty(
              property,
              "argument",
              this.transformEmbeddedExpression(property.argument, allocator),
            );
            return property;
          }
          if (isObjectProperty(property)) {
            if (isExpression(property.value)) {
              const originalValue = property.value;
              const transformedValue = this.transformEmbeddedExpression(originalValue, allocator);
              if (property.shorthand && transformedValue !== originalValue)
                setNodeProperty(property, "shorthand", false);
              setNodeProperty(property, "value", transformedValue);
            }
            return property;
          }
          if (isObjectMethod(property)) {
            const value = getNodeProperty(property, "value");
            if (isFunctionExpression(value)) {
              setNodeProperty(
                value,
                "body",
                this.withShadowedForIndices(value.params, () =>
                  this.transformBlockStatement(value.body, allocator),
                ),
              );
            }
            return property;
          }
          return property;
        }),
      );
      return expression;
    }
    if (isSequenceExpression(expression)) {
      setNodeProperty(
        expression,
        "expressions",
        expression.expressions.map((item) => this.transformEmbeddedExpression(item, allocator)),
      );
      return expression;
    }
    if (isUnaryExpression(expression) || isAwaitExpression(expression)) {
      setNodeProperty(
        expression,
        "argument",
        this.transformEmbeddedExpression(expression.argument, allocator),
      );
      return expression;
    }
    if (isUpdateExpression(expression)) return expression;
    if (isAssignmentExpression(expression)) {
      setNodeProperty(
        expression,
        "right",
        this.transformEmbeddedExpression(expression.right, allocator),
      );
      return expression;
    }
    if (isBinaryExpression(expression)) {
      if (isExpression(expression.left))
        setNodeProperty(
          expression,
          "left",
          this.transformEmbeddedExpression(expression.left, allocator),
        );
      if (isExpression(expression.right))
        setNodeProperty(
          expression,
          "right",
          this.transformEmbeddedExpression(expression.right, allocator),
        );
      return expression;
    }
    if (isTemplateLiteral(expression)) {
      setNodeProperty(
        expression,
        "expressions",
        expression.expressions.map((item) => this.transformEmbeddedExpression(item, allocator)),
      );
      return expression;
    }
    if (isMemberExpression(expression)) {
      if (isExpression(expression.object))
        setNodeProperty(
          expression,
          "object",
          this.transformEmbeddedExpression(expression.object, allocator),
        );
      if (expression.computed && isExpression(expression.property))
        setNodeProperty(
          expression,
          "property",
          this.transformEmbeddedExpression(expression.property, allocator),
        );
      return expression;
    }
    // Oxc's ESTree AST represents optional chains as ChainExpression, unlike
    // Babel's OptionalMemberExpression / OptionalCallExpression nodes.
    if (isType(expression, "ChainExpression")) {
      setNodeProperty(
        expression,
        "expression",
        this.transformEmbeddedExpression(expression.expression, allocator),
      );
      return expression;
    }
    if (
      isTSAsExpression(expression) ||
      isTSNonNullExpression(expression) ||
      isType(expression, "TSSatisfiesExpression") ||
      isType(expression, "TSTypeAssertion")
    ) {
      setNodeProperty(
        expression,
        "expression",
        this.transformEmbeddedExpression(expression.expression, allocator),
      );
      return expression;
    }
    return expression;
  }

  private transformBlockStatement(
    block: NodeOfType<"BlockStatement">,
    allocator: IdentifierAllocator,
  ): NodeOfType<"BlockStatement"> {
    const statements: Node[] = [];

    for (const statement of block.body) {
      if (isReturnStatement(statement)) {
        const lowered = this.transformJSXReturnStatement(statement, allocator);
        if (lowered) {
          // A return is already inside a statement list, so its setup can live
          // beside it instead of introducing another lexical block.
          statements.push(...lowered);
          continue;
        }
      }

      statements.push(this.transformStatement(statement, allocator));
    }

    setNodeProperty(block, "body", statements);
    return block;
  }

  /**
   * Lower a JSX return into its required setup statements and final return.
   * The caller decides whether those statements can be inserted directly or
   * need a block to occupy a single-statement position.
   */
  private transformJSXReturnStatement(
    statement: NodeOfType<"ReturnStatement">,
    allocator: IdentifierAllocator,
  ): Node[] | null {
    const argument = statement.argument;
    if (!argument || (!isJSXElement(argument) && !isJSXFragment(argument))) {
      return null;
    }

    const setup: Node[] = [];
    const returned = this.transformStatementContextExpression(
      argument,
      allocator,
      setup,
      isJSXFragment(argument),
    );
    setup.push(inheritSourceLocation(returnStatement(returned), statement));
    return setup;
  }

  private transformStatement(statement: Node, allocator: IdentifierAllocator): Node {
    if (isReturnStatement(statement)) {
      const lowered = this.transformJSXReturnStatement(statement, allocator);
      if (lowered) {
        // Keep a normal return as a normal return. Only introduce a block when
        // setup statements must occupy a single-statement position.
        return lowered.length === 1
          ? lowered[0]
          : inheritSourceLocation(blockStatement(lowered), statement);
      }

      if (statement.argument && isExpression(statement.argument)) {
        setNodeProperty(
          statement,
          "argument",
          this.transformEmbeddedExpression(statement.argument, allocator),
        );
      }
      return statement;
    }

    if (isVariableDeclaration(statement)) {
      for (const declaration of statement.declarations) {
        if (this.transformComponentVariable(declaration)) continue;
        if (!declaration.init || !isExpression(declaration.init)) continue;
        this.assertJSXInitializerIsLazy(declaration);
        setNodeProperty(
          declaration,
          "init",
          this.transformEmbeddedExpression(declaration.init, allocator),
        );
      }
      return statement;
    }

    if (isExpressionStatement(statement)) {
      setNodeProperty(
        statement,
        "expression",
        this.transformEmbeddedExpression(statement.expression, allocator),
      );
      return statement;
    }

    if (isBlockStatement(statement)) return this.transformBlockStatement(statement, allocator);

    if (isIfStatement(statement)) {
      setNodeProperty(
        statement,
        "test",
        this.transformEmbeddedExpression(statement.test, allocator),
      );
      setNodeProperty(
        statement,
        "consequent",
        this.transformStatement(statement.consequent, allocator),
      );
      if (statement.alternate) {
        setNodeProperty(
          statement,
          "alternate",
          this.transformStatement(statement.alternate, allocator),
        );
      }
      return statement;
    }

    if (isFunctionDeclaration(statement)) {
      if (statement.id && isComponentName(statement.id.name)) {
        return this.transformComponentDeclaration(statement);
      }

      const nestedAllocator = this.createIdentifierAllocator();
      setNodeProperty(
        statement,
        "body",
        this.specializedForCallbacks.has(statement)
          ? this.withForCallback(statement.params ?? [], () =>
              this.transformBlockStatement(statement.body, nestedAllocator),
            )
          : this.transformBlockStatement(statement.body, nestedAllocator),
      );
      return statement;
    }

    if (isExpression(statement)) {
      return this.transformEmbeddedExpression(statement, allocator);
    }

    // Generic visitor traversal handles switch, try/catch, loops, and future
    // ESTree statement forms while ensuring every nested return is transformed.
    for (const key of getVisitorKeys(statement)) {
      if (this.isTypeOnlyPropRewriteKey(key)) continue;

      const value = getNodeProperty(statement, key);
      if (isNodeArray(value)) {
        setNodeProperty(
          statement,
          key,
          value.map((child) => (isNode(child) ? this.transformStatement(child, allocator) : child)),
        );
      } else if (isNode(value)) {
        setNodeProperty(statement, key, this.transformStatement(value, allocator));
      }
    }

    return statement;
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
      const value = getNodeProperty(node, key);
      if (isNodeArray(value)) {
        for (const child of value) if (isNode(child) && this.containsEagerJSX(child)) return true;
      } else if (isNode(value) && this.containsEagerJSX(value)) return true;
    }
    return false;
  }

  private assertJSXInitializerIsLazy(declaration: Node): void {
    const initializer = getNodeProperty(declaration, "init");
    if (!isNode(initializer) || !this.containsEagerJSX(initializer)) return;
    const id = getNodeProperty(declaration, "id");
    const variableName = isIdentifier(id) ? `"${id.name}"` : "this variable";
    const message =
      `JSX in the initializer for ${variableName} must be wrapped in a function ` +
      "to preserve SSR hydration order. For example: const view = () => (<>...</>);";
    const location = declaration.loc?.start;
    const suffix = location ? ` (line ${location.line}, column ${location.column + 1})` : "";
    throw new Error(`${message}${suffix} in ${this.filename}`);
  }

  private createComponentCall(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
  ): ExpressionNode {
    const componentExpression = this.createComponentExpression(node.openingElement.name);
    const props = this.createComponentProps(node, allocator);
    return callExpression(componentExpression, props ? [props] : []);
  }

  private createComponentExpression(name: Node): ExpressionNode {
    if (isJSXIdentifier(name)) return identifier(name.name);
    if (isJSXMemberExpression(name)) {
      return memberExpression(
        this.createComponentExpression(name.object),
        identifier(name.property.name),
      );
    }
    throw new Error("Vynn currently only supports simple or member-expression components.");
  }

  private createComponentProps(
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
  ): Node | null {
    const properties: Node[] = [];
    for (const attribute of node.openingElement.attributes) {
      if (isJSXSpreadAttribute(attribute)) {
        properties.push(
          spreadElement(this.transformEmbeddedExpression(attribute.argument, allocator)),
        );
        continue;
      }
      if (!isJSXAttribute(attribute)) continue;
      const name = getJSXAttributeName(attribute.name);

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
            blockStatement([returnStatement(stringLiteral(attribute.value.value))]),
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
    if (children) properties.push(objectMethod("get", identifier("children"), [], children));
    return objectExpression(properties);
  }

  private createComponentRef(expression: Node): Node {
    const refParameter = identifier("r$");
    const statements: Node[] = [];
    if (isIdentifier(expression)) {
      const refIdentifier = this.generateUidIdentifier("ref");
      statements.push(
        variableDeclaration("const", [variableDeclarator(refIdentifier, cloneNode(expression))]),
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
            assignmentExpression("=", cloneNode(expression), cloneNode(refParameter)),
          ),
        ),
      );
      return objectMethod("method", identifier("ref"), [refParameter], blockStatement(statements));
    }
    const refIdentifier = this.generateUidIdentifier("ref");
    statements.push(variableDeclaration("const", [variableDeclarator(refIdentifier, expression)]));
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
    return objectMethod("method", identifier("ref"), [refParameter], blockStatement(statements));
  }

  private createComponentGetterBody(
    expression: ExpressionNode,
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
    node: NodeOfType<"JSXElement">,
    allocator: IdentifierAllocator,
  ): Node | null {
    const children: ExpressionNode[] = [];
    const statements: Node[] = [];

    const hasLaterHostElement: boolean[] = new Array(node.children.length).fill(false);
    let hasHostElement = false;
    for (let index = node.children.length - 1; index >= 0; index--) {
      hasLaterHostElement[index] = hasHostElement;
      const sibling = node.children[index];
      if (isJSXElement(sibling) && !isComponentElement(sibling)) hasHostElement = true;
    }

    // Setup for a later host child is emitted into this getter. Materialize
    // earlier sibling values first so their evaluation order stays unchanged.
    const captureChild = (expression: ExpressionNode): ExpressionNode => {
      const child = this.generateUidIdentifier("child");
      statements.push(
        variableDeclaration("const", [variableDeclarator(child, expression)]),
      );
      return child;
    };

    for (let index = 0; index < node.children.length; index++) {
      const child = node.children[index];
      if (isJSXText(child)) {
        const text = normalizeJSXText(child.value);
        if (text) {
          const expression = stringLiteral(text);
          children.push(hasLaterHostElement[index] ? captureChild(expression) : expression);
        }
        continue;
      }

      if (isJSXExpressionContainer(child)) {
        const expression = child.expression;
        if (isJSXEmptyExpression(expression) || !isExpression(expression)) continue;

        const transformed = isStringLiteral(expression)
          ? stringLiteral(expression.value)
          : this.transformEmbeddedExpression(expression, allocator);
        const value =
          isStringLiteral(expression) ||
          this.isForExpression(transformed) ||
          this.isIfExpression(transformed) ||
          this.isNodesExpression(transformed)
            ? transformed
            : this.createDynamicExpression(transformed);
        children.push(hasLaterHostElement[index] ? captureChild(value) : value);
        continue;
      }

      if (isJSXElement(child)) {
        if (isComponentElement(child)) {
          const component = this.createComponentCall(child, allocator);
          children.push(hasLaterHostElement[index] ? captureChild(component) : component);
          continue;
        }

        const statementCount = statements.length;
        const element = this.createElement(child, allocator, statements);

        // A static host template has no setup statements, so evaluate its
        // factory call now when a later host element could otherwise overtake it.
        children.push(
          hasLaterHostElement[index] && statements.length === statementCount
            ? captureChild(element)
            : element,
        );
        continue;
      }

      if (isJSXFragment(child)) {
        const fragment = this.createFragmentInStatements(child, allocator, statements, true);
        children.push(hasLaterHostElement[index] ? captureChild(fragment) : fragment);
      }
    }

    if (children.length === 0) return null;
    const result = children.length === 1 ? children[0] : arrayExpression(children);
    statements.push(returnStatement(result));
    return blockStatement(statements);
  }

  private transformAttributes(
    opening: NodeOfType<"JSXOpeningElement">,
    elementId: Node,
    statements: Node[],
    allocator: IdentifierAllocator,
  ): void {
    for (const attribute of opening.attributes) {
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
      if (!isJSXAttribute(attribute)) continue;
      const name = getJSXAttributeName(attribute.name);

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
      const event = this.getEventAttribute(name);
      if (event) {
        const value = attribute.value;
        if (!isJSXExpressionContainer(value) || !isExpression(value.expression)) continue;
        statements.push(
          expressionStatement(
            this.createEvent(
              elementId,
              event.name,
              this.transformEmbeddedExpression(value.expression, allocator),
              event.capture,
            ),
          ),
        );
        continue;
      }
      if (isJSXExpressionContainer(attribute.value)) {
        const expression = attribute.value.expression;
        if (isJSXEmptyExpression(expression) || !isExpression(expression)) continue;
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
          expressionStatement(this.createStaticAttribute(elementId, name, attribute.value)),
        );
        continue;
      }
      if (attribute.value === null) {
        statements.push(
          expressionStatement(this.createStaticAttribute(elementId, name, booleanLiteral(true))),
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
            assignmentExpression("=", cloneNode(expression), cloneNode(elementId)),
          ),
        ),
      ];
    }
    if (isArrowFunctionExpression(expression) || isFunctionExpression(expression)) {
      return [expressionStatement(callExpression(expression, [cloneNode(elementId)]))];
    }
    const refIdentifier = this.generateUidIdentifier("ref");
    return [
      variableDeclaration("const", [variableDeclarator(refIdentifier, expression)]),
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

  private createAttribute(elementId: Node, name: string, expression: Node): Node {
    return callExpression(this.getRuntimeHelper("$attr"), [
      elementId,
      stringLiteral(name),
      arrowFunctionExpression([], expression),
    ]);
  }

  private createStaticAttribute(elementId: Node, name: string, value: Node): Node {
    return callExpression(this.getRuntimeHelper("$attr"), [elementId, stringLiteral(name), value]);
  }

  private createEvent(elementId: Node, event: string, expression: Node, capture = false): Node {
    const args = [elementId, stringLiteral(event), expression];
    if (capture) args.push(booleanLiteral(true));
    return callExpression(this.getRuntimeHelper("$on"), args);
  }

  private getEventAttribute(name: string): { name: string; capture: boolean } | null {
    if (name.length <= 2 || !name.startsWith("on") || name[2] !== name[2].toUpperCase()) {
      return null;
    }

    const capture = name.endsWith("Capture");
    const eventName = name.slice(2, capture ? -7 : undefined).toLowerCase();
    if (!eventName) return null;

    return {
      name: eventName === "doubleclick" ? "dblclick" : eventName,
      capture,
    };
  }

  private createInsert(elementId: Node, expression: Node, slotId?: string): Node {
    let child: Node;

    if (slotId !== undefined) {
      // Template slots must claim their static prefix before evaluating the
      // dynamic child. Keep helper calls such as $if() and $for() lazy; eagerly
      // evaluating them here can consume hydration nodes that belong to the
      // static content immediately preceding this slot.
      child = arrowFunctionExpression([], expression);
    } else if (
      isLiteralString(expression) ||
      isNumericLiteral(expression) ||
      this.isForExpression(expression) ||
      this.isIfExpression(expression) ||
      this.isNodesExpression(expression)
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

    const args = [elementId, child];
    if (slotId !== undefined) args.push(stringLiteral(slotId));
    return callExpression(this.getRuntimeHelper("$insert"), args);
  }
}
