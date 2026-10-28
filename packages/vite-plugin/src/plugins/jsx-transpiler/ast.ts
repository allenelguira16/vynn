import { decodeHTML } from "entities";
import { visitorKeys } from "oxc-parser";

type Node = any;

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

export const isNode = (node: unknown): node is Node =>
  !!node && typeof node === "object" && typeof (node as Node).type === "string";
export const isType = (node: Node, type: string): boolean =>
  !!node && node.type === type;
export const isIdentifier = (node: Node): boolean => isType(node, "Identifier");
export const isJSXIdentifier = (node: Node): boolean =>
  isType(node, "JSXIdentifier");
export const isExpression = (node: Node): boolean =>
  !!node && expressionTypes.has(node.type);
export const isFunctionLike = (node: Node): boolean =>
  isType(node, "ArrowFunctionExpression") ||
  isType(node, "FunctionExpression") ||
  isType(node, "FunctionDeclaration");
export const isLiteralString = (node: Node): boolean =>
  isType(node, "Literal") && typeof node.value === "string";
export const isNumericLiteral = (node: Node): boolean =>
  isType(node, "Literal") && typeof node.value === "number";
export const isStringLiteral = isLiteralString;
export const isJSXElement = (node: Node): boolean => isType(node, "JSXElement");
export const isJSXFragment = (node: Node): boolean =>
  isType(node, "JSXFragment");
export const isJSXText = (node: Node): boolean => isType(node, "JSXText");
export const isJSXExpressionContainer = (node: Node): boolean =>
  isType(node, "JSXExpressionContainer");
export const isJSXEmptyExpression = (node: Node): boolean =>
  isType(node, "JSXEmptyExpression");
export const isJSXAttribute = (node: Node): boolean =>
  isType(node, "JSXAttribute");
export const isJSXSpreadAttribute = (node: Node): boolean =>
  isType(node, "JSXSpreadAttribute");
export const isJSXMemberExpression = (node: Node): boolean =>
  isType(node, "JSXMemberExpression");
export const isCallExpression = (node: Node): boolean =>
  isType(node, "CallExpression");
export const isMemberExpression = (node: Node): boolean =>
  isType(node, "MemberExpression");
export const isArrowFunctionExpression = (node: Node): boolean =>
  isType(node, "ArrowFunctionExpression");
export const isFunctionExpression = (node: Node): boolean =>
  isType(node, "FunctionExpression");
export const isFunctionDeclaration = (node: Node): boolean =>
  isType(node, "FunctionDeclaration");
export const isBlockStatement = (node: Node): boolean =>
  isType(node, "BlockStatement");
export const isReturnStatement = (node: Node): boolean =>
  isType(node, "ReturnStatement");
export const isVariableDeclaration = (node: Node): boolean =>
  isType(node, "VariableDeclaration");
export const isExpressionStatement = (node: Node): boolean =>
  isType(node, "ExpressionStatement");
export const isObjectExpression = (node: Node): boolean =>
  isType(node, "ObjectExpression");
export const isObjectProperty = (node: Node): boolean =>
  isType(node, "Property") && !node.method && node.kind === "init";
export const isObjectMethod = (node: Node): boolean =>
  isType(node, "Property") &&
  (node.method || node.kind === "get" || node.kind === "set");
export const isSpreadElement = (node: Node): boolean =>
  isType(node, "SpreadElement");
export const isArrayExpression = (node: Node): boolean =>
  isType(node, "ArrayExpression");
export const isRestElement = (node: Node): boolean =>
  isType(node, "RestElement");
export const isAssignmentPattern = (node: Node): boolean =>
  isType(node, "AssignmentPattern");
export const isObjectPattern = (node: Node): boolean =>
  isType(node, "ObjectPattern");
export const isArrayPattern = (node: Node): boolean =>
  isType(node, "ArrayPattern");
export const isIfStatement = (node: Node): boolean =>
  isType(node, "IfStatement");
export const isLogicalExpression = (node: Node): boolean =>
  isType(node, "LogicalExpression");
export const isConditionalExpression = (node: Node): boolean =>
  isType(node, "ConditionalExpression");
export const isUnaryExpression = (node: Node): boolean =>
  isType(node, "UnaryExpression");
export const isAwaitExpression = (node: Node): boolean =>
  isType(node, "AwaitExpression");
export const isUpdateExpression = (node: Node): boolean =>
  isType(node, "UpdateExpression");
export const isAssignmentExpression = (node: Node): boolean =>
  isType(node, "AssignmentExpression");
export const isBinaryExpression = (node: Node): boolean =>
  isType(node, "BinaryExpression");
export const isTemplateLiteral = (node: Node): boolean =>
  isType(node, "TemplateLiteral");
export const isSequenceExpression = (node: Node): boolean =>
  isType(node, "SequenceExpression");
export const isTSAsExpression = (node: Node): boolean =>
  isType(node, "TSAsExpression");
export const isTSNonNullExpression = (node: Node): boolean =>
  isType(node, "TSNonNullExpression");
export const isImportDeclaration = (node: Node): boolean =>
  isType(node, "ImportDeclaration");
export const isImportSpecifier = (node: Node): boolean =>
  isType(node, "ImportSpecifier");

export function identifier(name: string): Node {
  return { type: "Identifier", name };
}
export function literal(value: string | number | boolean | null): Node {
  return {
    type: "Literal",
    value,
    raw: typeof value === "string" ? JSON.stringify(value) : String(value),
  };
}
export function stringLiteral(value: string): Node {
  return literal(value);
}
export function numericLiteral(value: number): Node {
  return literal(value);
}
export function booleanLiteral(value: boolean): Node {
  return literal(value);
}
export function voidZero(): Node {
  return {
    type: "UnaryExpression",
    operator: "void",
    prefix: true,
    argument: numericLiteral(0),
  };
}
export function cloneNode<T extends Node>(node: T): T {
  return structuredClone(node);
}
export function memberExpression(
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
export function callExpression(callee: Node, args: Node[]): Node {
  return { type: "CallExpression", callee, arguments: args, optional: false };
}
export function arrowFunctionExpression(params: Node[], body: Node): Node {
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
export function functionExpression(
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
export function blockStatement(body: Node[]): Node {
  return { type: "BlockStatement", body };
}
export function returnStatement(argument: Node | null): Node {
  return { type: "ReturnStatement", argument };
}
export function expressionStatement(expression: Node): Node {
  return { type: "ExpressionStatement", expression };
}
export function variableDeclarator(id: Node, init: Node | null): Node {
  return { type: "VariableDeclarator", id, init, definite: false };
}
export function variableDeclaration(
  kind: "const" | "let" | "var",
  declarations: Node[],
): Node {
  return { type: "VariableDeclaration", kind, declarations };
}
export function arrayExpression(elements: Array<Node | null>): Node {
  return { type: "ArrayExpression", elements };
}
export function objectExpression(properties: Node[]): Node {
  return { type: "ObjectExpression", properties };
}
export function spreadElement(argument: Node): Node {
  return { type: "SpreadElement", argument };
}
export function unaryExpression(operator: string, argument: Node): Node {
  return { type: "UnaryExpression", operator, argument, prefix: true };
}
export function binaryExpression(
  operator: string,
  left: Node,
  right: Node,
): Node {
  return { type: "BinaryExpression", operator, left, right };
}
export function conditionalExpression(
  test: Node,
  consequent: Node,
  alternate: Node,
): Node {
  return { type: "ConditionalExpression", test, consequent, alternate };
}
export function assignmentExpression(
  operator: string,
  left: Node,
  right: Node,
): Node {
  return { type: "AssignmentExpression", operator, left, right };
}
export function propertyKey(name: string): Node {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    ? identifier(name)
    : stringLiteral(name);
}
export function objectProperty(
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
export function objectMethod(
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
export function importSpecifier(local: Node, imported: Node): Node {
  return { type: "ImportSpecifier", imported, local, importKind: "value" };
}
export function importDeclaration(specifiers: Node[], source: string): Node {
  return {
    type: "ImportDeclaration",
    specifiers,
    source: stringLiteral(source),
    importKind: "value",
    assertions: [],
    attributes: [],
  };
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
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) callback(child);
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

export function isComponentElement(node: Node): boolean {
  const name = node.openingElement.name;
  if (isJSXIdentifier(name)) return isComponentName(name.name);
  return isJSXMemberExpression(name);
}

export function isArrowComponentDeclaration(declaration: Node): boolean {
  return (
    isIdentifier(declaration.id) &&
    isComponentName(declaration.id.name) &&
    isArrowFunctionExpression(declaration.init)
  );
}

export function findReturnStatement(node: Node): Node | undefined {
  if (!isBlockStatement(node.body)) return undefined;
  return node.body.body.find((statement: Node) => isReturnStatement(statement));
}

export function findArrowReturnStatement(body: Node): Node | undefined {
  if (!isBlockStatement(body)) return undefined;
  return body.body.find((statement: Node) => isReturnStatement(statement));
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

export function programContainsJSX(program: Node): boolean {
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
