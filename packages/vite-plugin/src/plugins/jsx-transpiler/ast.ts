import type { TSESTree } from "@typescript-eslint/types";
import { decodeHTML } from "entities";
import { visitorKeys } from "oxc-parser";

type SourcePosition = { line: number; column: number };

const expressionTypeNames = [
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
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
] as const;

const expressionTypes = new Set<string>(expressionTypeNames);

type SourceLocation = { start: SourcePosition; end: SourcePosition };

type NodeMetadata = {
  start?: number;
  end?: number;
  loc?: SourceLocation | null;
  range?: [number, number];
  parent?: Node;
};

type CompilerSpecificNode = {
  /** Legacy ESTree/Babel node label handled defensively by the JSX visitor. */
  type: "ObjectMethod";
};

/** Index the published ESTree union by its string-valued discriminant. */
type NodeMap = {
  [Current in TSESTree.Node as `${Current["type"]}`]: Current & NodeMetadata;
};

export type Node = TSESTree.Node & NodeMetadata | (CompilerSpecificNode & NodeMetadata);

export type NodeOfType<Type extends string> =
  Type extends keyof NodeMap
    ? NodeMap[Type]
    : Type extends CompilerSpecificNode["type"]
      ? CompilerSpecificNode & NodeMetadata
      : never;

export type ExpressionNode = TSESTree.Expression & NodeMetadata;

export function generatedNode<const Current extends { type: string }>(
  value: Current,
): NodeOfType<Current["type"]> & Current {
  // Generated nodes carry the concrete string tag and the matching node fields.
  return value as unknown as NodeOfType<Current["type"]> & Current;
}

export function getNodeProperty(node: Node, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

export function setNodeProperty(node: Node, key: string, value: unknown): void {
  (node as unknown as Record<string, unknown>)[key] = value;
}

export function isNodeArray(value: unknown): value is Array<Node | null> {
  if (!Array.isArray(value)) return false;
  const items: unknown[] = value;
  return items.every((item) => item === null || isNode(item));
}

export const isNode = (value: unknown): value is Node => {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return typeof value.type === "string";
};

export const isType = <Type extends string>(
  value: unknown,
  type: Type,
): value is NodeOfType<Type> => isNode(value) && value.type === type;

export const isIdentifier = (node: unknown): node is NodeOfType<"Identifier"> =>
  isType(node, "Identifier");
export const isJSXIdentifier = (node: unknown): node is NodeOfType<"JSXIdentifier"> =>
  isType(node, "JSXIdentifier");
export const isExpression = (node: unknown): node is ExpressionNode =>
  isNode(node) && expressionTypes.has(node.type);
export const isFunctionLike = (
  node: unknown,
): node is NodeOfType<"ArrowFunctionExpression" | "FunctionExpression" | "FunctionDeclaration"> =>
  isType(node, "ArrowFunctionExpression") ||
  isType(node, "FunctionExpression") ||
  isType(node, "FunctionDeclaration");
export const isLiteralString = (
  node: unknown,
): node is NodeOfType<"Literal"> & { value: string } =>
  isType(node, "Literal") && typeof node.value === "string";
export const isNumericLiteral = (
  node: unknown,
): node is NodeOfType<"Literal"> & { value: number } =>
  isType(node, "Literal") && typeof node.value === "number";
export const isStringLiteral = isLiteralString;
export const isJSXElement = (node: unknown): node is NodeOfType<"JSXElement"> =>
  isType(node, "JSXElement");
export const isJSXFragment = (node: unknown): node is NodeOfType<"JSXFragment"> =>
  isType(node, "JSXFragment");
export const isJSXText = (node: unknown): node is NodeOfType<"JSXText"> =>
  isType(node, "JSXText");
export const isJSXExpressionContainer = (
  node: unknown,
): node is NodeOfType<"JSXExpressionContainer"> =>
  isType(node, "JSXExpressionContainer");
export const isJSXEmptyExpression = (
  node: unknown,
): node is NodeOfType<"JSXEmptyExpression"> =>
  isType(node, "JSXEmptyExpression");
export const isJSXAttribute = (node: unknown): node is NodeOfType<"JSXAttribute"> =>
  isType(node, "JSXAttribute");
export const isJSXSpreadAttribute = (
  node: unknown,
): node is NodeOfType<"JSXSpreadAttribute"> =>
  isType(node, "JSXSpreadAttribute");
export const isJSXMemberExpression = (
  node: unknown,
): node is NodeOfType<"JSXMemberExpression"> =>
  isType(node, "JSXMemberExpression");
export const isCallExpression = (node: unknown): node is NodeOfType<"CallExpression"> =>
  isType(node, "CallExpression");
export const isMemberExpression = (
  node: unknown,
): node is NodeOfType<"MemberExpression"> =>
  isType(node, "MemberExpression");
export const isArrowFunctionExpression = (
  node: unknown,
): node is NodeOfType<"ArrowFunctionExpression"> =>
  isType(node, "ArrowFunctionExpression");
export const isFunctionExpression = (
  node: unknown,
): node is NodeOfType<"FunctionExpression"> =>
  isType(node, "FunctionExpression");
export const isFunctionDeclaration = (
  node: unknown,
): node is NodeOfType<"FunctionDeclaration"> =>
  isType(node, "FunctionDeclaration");
export const isBlockStatement = (
  node: unknown,
): node is NodeOfType<"BlockStatement"> =>
  isType(node, "BlockStatement");
export const isReturnStatement = (
  node: unknown,
): node is NodeOfType<"ReturnStatement"> =>
  isType(node, "ReturnStatement");
export const isVariableDeclaration = (
  node: unknown,
): node is NodeOfType<"VariableDeclaration"> =>
  isType(node, "VariableDeclaration");
export const isExpressionStatement = (
  node: unknown,
): node is NodeOfType<"ExpressionStatement"> =>
  isType(node, "ExpressionStatement");
export const isObjectExpression = (
  node: unknown,
): node is NodeOfType<"ObjectExpression"> =>
  isType(node, "ObjectExpression");
export const isObjectProperty = (node: unknown): node is NodeOfType<"Property"> =>
  isType(node, "Property") && !node.method && node.kind === "init";
export const isObjectMethod = (node: unknown): node is NodeOfType<"Property"> =>
  isType(node, "Property") &&
  (node.method || node.kind === "get" || node.kind === "set");
export const isSpreadElement = (node: unknown): node is NodeOfType<"SpreadElement"> =>
  isType(node, "SpreadElement");
export const isArrayExpression = (node: unknown): node is NodeOfType<"ArrayExpression"> =>
  isType(node, "ArrayExpression");
export const isRestElement = (node: unknown): node is NodeOfType<"RestElement"> =>
  isType(node, "RestElement");
export const isAssignmentPattern = (
  node: unknown,
): node is NodeOfType<"AssignmentPattern"> =>
  isType(node, "AssignmentPattern");
export const isObjectPattern = (node: unknown): node is NodeOfType<"ObjectPattern"> =>
  isType(node, "ObjectPattern");
export const isArrayPattern = (node: unknown): node is NodeOfType<"ArrayPattern"> =>
  isType(node, "ArrayPattern");
export const isIfStatement = (node: unknown): node is NodeOfType<"IfStatement"> =>
  isType(node, "IfStatement");
export const isLogicalExpression = (
  node: unknown,
): node is NodeOfType<"LogicalExpression"> =>
  isType(node, "LogicalExpression");
export const isConditionalExpression = (
  node: unknown,
): node is NodeOfType<"ConditionalExpression"> =>
  isType(node, "ConditionalExpression");
export const isUnaryExpression = (
  node: unknown,
): node is NodeOfType<"UnaryExpression"> =>
  isType(node, "UnaryExpression");
export const isAwaitExpression = (node: unknown): node is NodeOfType<"AwaitExpression"> =>
  isType(node, "AwaitExpression");
export const isUpdateExpression = (node: unknown): node is NodeOfType<"UpdateExpression"> =>
  isType(node, "UpdateExpression");
export const isAssignmentExpression = (
  node: unknown,
): node is NodeOfType<"AssignmentExpression"> =>
  isType(node, "AssignmentExpression");
export const isBinaryExpression = (node: unknown): node is NodeOfType<"BinaryExpression"> =>
  isType(node, "BinaryExpression");
export const isTemplateLiteral = (
  node: unknown,
): node is NodeOfType<"TemplateLiteral"> =>
  isType(node, "TemplateLiteral");
export const isSequenceExpression = (
  node: unknown,
): node is NodeOfType<"SequenceExpression"> =>
  isType(node, "SequenceExpression");
export const isTSAsExpression = (node: unknown): node is NodeOfType<"TSAsExpression"> =>
  isType(node, "TSAsExpression");
export const isTSNonNullExpression = (
  node: unknown,
): node is NodeOfType<"TSNonNullExpression"> =>
  isType(node, "TSNonNullExpression");
export const isImportDeclaration = (
  node: unknown,
): node is NodeOfType<"ImportDeclaration"> =>
  isType(node, "ImportDeclaration");
export const isImportSpecifier = (
  node: unknown,
): node is NodeOfType<"ImportSpecifier"> =>
  isType(node, "ImportSpecifier");

export function identifier(name: string): NodeOfType<"Identifier"> {
  return generatedNode({ type: "Identifier", name });
}

export function literal<Value extends string | number | boolean | null>(
  value: Value,
): NodeOfType<"Literal"> & { value: Value } {
  return generatedNode({
    type: "Literal",
    value,
    raw: typeof value === "string" ? JSON.stringify(value) : String(value),
  });
}

export function stringLiteral(value: string): NodeOfType<"Literal"> & { value: string } {
  return literal(value);
}
export function numericLiteral(value: number): NodeOfType<"Literal"> & { value: number } {
  return literal(value);
}
export function booleanLiteral(value: boolean): NodeOfType<"Literal"> & { value: boolean } {
  return literal(value);
}
export function voidZero(): NodeOfType<"UnaryExpression"> {
  return generatedNode({
    type: "UnaryExpression",
    operator: "void",
    prefix: true,
    argument: numericLiteral(0),
  });
}
export function cloneNode<T extends Node>(node: T): T {
  return structuredClone(node);
}
export function memberExpression(
  object: Node,
  property: Node,
  computed = false,
): NodeOfType<"MemberExpression"> {
  return generatedNode({
    type: "MemberExpression",
    object,
    property,
    computed,
    optional: false,
  });
}
export function callExpression(callee: Node, args: Node[]): NodeOfType<"CallExpression"> {
  return generatedNode({
    type: "CallExpression",
    callee,
    arguments: args,
    optional: false,
  });
}

export function arrowFunctionExpression(
  params: Node[],
  body: Node,
): NodeOfType<"ArrowFunctionExpression"> {
  return generatedNode({
    type: "ArrowFunctionExpression",
    id: null,
    params,
    body,
    generator: false,
    async: false,
    expression: !isBlockStatement(body),
  });
}

export function functionExpression(
  id: Node | null,
  params: Node[],
  body: Node,
  generator = false,
  async = false,
): NodeOfType<"FunctionExpression"> {
  return generatedNode({
    type: "FunctionExpression",
    id,
    params,
    body,
    generator,
    async,
    expression: false,
  });
}
export function blockStatement(body: Node[]): NodeOfType<"BlockStatement"> {
  return generatedNode({ type: "BlockStatement", body });
}

export function returnStatement(argument: Node | null): NodeOfType<"ReturnStatement"> {
  return generatedNode({ type: "ReturnStatement", argument });
}
export function expressionStatement(expression: Node): NodeOfType<"ExpressionStatement"> {
  return generatedNode({ type: "ExpressionStatement", expression });
}
export function variableDeclarator(
  id: Node,
  init: Node | null,
): NodeOfType<"VariableDeclarator"> {
  return generatedNode({ type: "VariableDeclarator", id, init, definite: false });
}
export function variableDeclaration(
  kind: "const" | "let" | "var",
  declarations: Node[],
): NodeOfType<"VariableDeclaration"> {
  return generatedNode({ type: "VariableDeclaration", kind, declarations });
}
export function arrayExpression(
  elements: Array<Node | null>,
): NodeOfType<"ArrayExpression"> {
  return generatedNode({ type: "ArrayExpression", elements });
}
export function objectExpression(properties: Node[]): NodeOfType<"ObjectExpression"> {
  return generatedNode({ type: "ObjectExpression", properties });
}
export function spreadElement(argument: Node): NodeOfType<"SpreadElement"> {
  return generatedNode({ type: "SpreadElement", argument });
}
export function unaryExpression(
  operator: string,
  argument: Node,
): NodeOfType<"UnaryExpression"> {
  return generatedNode({ type: "UnaryExpression", operator, argument, prefix: true });
}
export function binaryExpression(
  operator: string,
  left: Node,
  right: Node,
): NodeOfType<"BinaryExpression"> {
  return generatedNode({ type: "BinaryExpression", operator, left, right });
}
export function conditionalExpression(
  test: Node,
  consequent: Node,
  alternate: Node,
): NodeOfType<"ConditionalExpression"> {
  return generatedNode({ type: "ConditionalExpression", test, consequent, alternate });
}
export function assignmentExpression(
  operator: string,
  left: Node,
  right: Node,
): NodeOfType<"AssignmentExpression"> {
  return generatedNode({ type: "AssignmentExpression", operator, left, right });
}
export function propertyKey(name: string): NodeOfType<"Identifier"> | (NodeOfType<"Literal"> & { value: string }) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    ? identifier(name)
    : stringLiteral(name);
}
export function objectProperty(
  key: Node,
  value: Node,
  options: {
    kind?: "init" | "get" | "set";
    method?: boolean;
    shorthand?: boolean;
    computed?: boolean;
  } = {},
): NodeOfType<"Property"> {
  return generatedNode({
    type: "Property",
    key,
    value,
    kind: options.kind ?? "init",
    method: options.method ?? false,
    shorthand: options.shorthand ?? false,
    computed: options.computed ?? false,
  });
}

export function objectMethod(
  kind: "method" | "get" | "set",
  key: Node,
  params: Node[],
  body: Node,
): NodeOfType<"Property"> {
  const fn = functionExpression(null, params, body);
  return objectProperty(key, fn, {
    kind: kind === "method" ? "init" : kind,
    method: kind === "method",
  });
}
export function importSpecifier(
  local: Node,
  imported: Node,
): NodeOfType<"ImportSpecifier"> {
  return generatedNode({ type: "ImportSpecifier", imported, local, importKind: "value" });
}

export function importDeclaration(
  specifiers: Node[],
  source: string,
): NodeOfType<"ImportDeclaration"> {
  return generatedNode({
    type: "ImportDeclaration",
    specifiers,
    source: stringLiteral(source),
    importKind: "value",
    assertions: [],
    attributes: [],
  });
}

export function getVisitorKeys(node: Node): string[] {
  const keys = (visitorKeys as Record<string, string[]>)[node.type];
  if (keys) return keys;
  return [];
}

export function forEachChild(
  node: Node,
  callback: (child: Node) => void,
): void {
  for (const key of getVisitorKeys(node)) {
    const value = getNodeProperty(node, key);
    if (isNodeArray(value)) {
      for (const child of value) if (child) callback(child);
    } else if (isNode(value)) {
      callback(value);
    }
  }
}

export function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

export function getJSXIdentifierName(name: Node): string {
  if (isJSXIdentifier(name)) return name.name;
  throw new Error(
    "Vynn currently only supports simple JSX identifiers for native elements.",
  );
}

export function isComponentElement(
  node: unknown,
): node is NodeOfType<"JSXElement"> {
  if (!isJSXElement(node)) return false;
  const name = node.openingElement.name;
  if (isJSXIdentifier(name)) return isComponentName(name.name);
  return isJSXMemberExpression(name);
}

export type ArrowComponentDeclaration = NodeOfType<"VariableDeclarator"> & {
  id: NodeOfType<"Identifier">;
  init: NodeOfType<"ArrowFunctionExpression">;
};

export function isArrowComponentDeclaration(
  declaration: unknown,
): declaration is ArrowComponentDeclaration {
  return (
    isType(declaration, "VariableDeclarator") &&
    isIdentifier(declaration.id) &&
    isComponentName(declaration.id.name) &&
    isArrowFunctionExpression(declaration.init)
  );
}

export function findReturnStatement(
  node: Node,
): NodeOfType<"ReturnStatement"> | undefined {
  const body = getNodeProperty(node, "body");
  if (!isBlockStatement(body)) return undefined;
  return body.body.find((statement) => isReturnStatement(statement));
}

export function findArrowReturnStatement(
  body: Node,
): NodeOfType<"ReturnStatement"> | undefined {
  if (!isBlockStatement(body)) return undefined;
  return body.body.find((statement) => isReturnStatement(statement));
}

export function normalizeJSXText(value: string): string {
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

export function inferLang(filename: string): "js" | "jsx" | "ts" | "tsx" {
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

export function createPositionLookup(
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

export function addSourceLocations(program: Node, source: string): void {
  const positionAt = createPositionLookup(source);
  const visit = (node: Node): void => {
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

export function programContainsJSX(program: Node): boolean {
  if (isJSXElement(program) || isJSXFragment(program)) return true;
  for (const key of getVisitorKeys(program)) {
    const value = getNodeProperty(program, key);
    if (isNodeArray(value)) {
      for (const child of value) {
        if (child && programContainsJSX(child)) return true;
      }
    } else if (isNode(value) && programContainsJSX(value)) {
      return true;
    }
  }
  return false;
}

export function inheritSourceLocation<T extends Node>(
  target: T,
  source: Node,
): T {
  const mutableTarget: Node = target;
  if (typeof source?.start === "number") mutableTarget.start = source.start;
  if (typeof source?.end === "number") mutableTarget.end = source.end;
  if (source?.loc) mutableTarget.loc = source.loc;
  if (source?.range) mutableTarget.range = source.range;
  return target;
}

/** Transform one source module with Oxc's ESTree-compatible parser. */
