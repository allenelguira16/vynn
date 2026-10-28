import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { visitorKeys } from "oxc-parser";
import {
  CREATE_SERVER_REFERENCE,
  type MarkedFunction,
  type Node,
  type SourceEdit,
} from "./shared.ts";

const isNode = (value: unknown): value is Node =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Node).type === "string";

function childrenOf(node: Node, visit: (child: Node) => void): void {
  const keys = (visitorKeys as Record<string, string[]>)[node.type] ?? [];
  for (const key of keys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visit(child);
    } else if (isNode(value)) {
      visit(value);
    }
  }
}

export function getDirectiveValue(statement: Node): string | undefined {
  if (typeof statement?.directive === "string") return statement.directive;
  if (statement?.type !== "ExpressionStatement") return undefined;

  const expression = statement.expression;
  if (
    (expression?.type === "Literal" || expression?.type === "StringLiteral") &&
    typeof expression.value === "string"
  ) {
    return expression.value;
  }
  return undefined;
}

function getUseServerDirective(fn: Node): Node | undefined {
  if (fn?.body?.type !== "BlockStatement") return undefined;

  for (const statement of fn.body.body as Node[]) {
    const value = getDirectiveValue(statement);
    if (value === "use server") return statement;
    // A function directive must occur in the directive prologue.
    if (value === undefined) break;
  }
  return undefined;
}

function isFunctionNode(node: Node): boolean {
  return (
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression"
  );
}

export function inferParserLanguage(id: string): "js" | "jsx" | "ts" | "tsx" {
  if (/\.tsx$/i.test(id)) return "tsx";
  if (/\.(?:ts|mts|cts)$/i.test(id)) return "ts";
  return "jsx";
}

export function cleanModuleId(id: string): string {
  return id.split("?", 1)[0].replace(/\\/g, "/");
}

function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function getModuleKey(root: string, moduleId: string): string {
  const absolute = resolve(moduleId);
  const relativeId = relative(root, absolute).replace(/\\/g, "/");
  if (
    relativeId === ".." ||
    relativeId.startsWith("../") ||
    isAbsolute(relativeId)
  ) {
    throw new Error(
      `[Vynn use server] Server functions must be declared inside the Vite project root. Received: ${moduleId}`,
    );
  }
  return relativeId;
}

export function applyEdits(source: string, edits: SourceEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  let previousStart = source.length + 1;

  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      throw new Error(
        "[Vynn use server] Internal compiler error: invalid source edit.",
      );
    }
    if (edit.end > previousStart) {
      throw new Error(
        "[Vynn use server] A server-marked function contains another server-marked function. Nested server boundaries are not supported yet.",
      );
    }
    result =
      result.slice(0, edit.start) + edit.content + result.slice(edit.end);
    previousStart = edit.start;
  }
  return result;
}

function getParamsSource(source: string, fn: Node): string {
  const params = (fn.params ?? []) as Node[];
  return params.map((param) => source.slice(param.start, param.end)).join(", ");
}

function getTypeParametersSource(source: string, fn: Node): string {
  const typeParameters = fn.typeParameters ?? fn.typeParams;
  if (
    typeParameters &&
    typeof typeParameters.start === "number" &&
    typeof typeParameters.end === "number"
  ) {
    return source.slice(typeParameters.start, typeParameters.end);
  }
  return "";
}

export function makeExtractedImplementation(
  source: string,
  marked: MarkedFunction,
): string {
  const { fn, directive, exportName } = marked;
  const body = fn.body as Node;
  const bodySource =
    source.slice(body.start, directive.start) +
    source.slice(directive.end, body.end);
  const typeParameters = getTypeParametersSource(source, fn);
  const params = getParamsSource(source, fn);
  const asyncPrefix = fn.async ? "async " : "";

  return `export ${asyncPrefix}function ${exportName}${typeParameters}(${params}) ${bodySource}`;
}

function makeReferenceCall(marked: MarkedFunction, isServer: boolean): string {
  return isServer
    ? `${CREATE_SERVER_REFERENCE}(${marked.exportName}, ${JSON.stringify(marked.id)})`
    : `${CREATE_SERVER_REFERENCE}(${JSON.stringify(marked.id)})`;
}

export function makeReplacement(
  marked: MarkedFunction,
  isServer: boolean,
): SourceEdit {
  const { fn, parent } = marked;
  const reference = makeReferenceCall(marked, isServer);

  if (fn.type !== "FunctionDeclaration") {
    return { start: fn.start, end: fn.end, content: reference };
  }

  const name = fn.id?.name;
  if (!name) {
    throw new Error(
      "[Vynn use server] Anonymous function declarations with a directive are not supported. Assign the function a name.",
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

export function collectMarkedFunctions(
  program: Node,
  _source: string,
  root: string,
  moduleId: string,
): MarkedFunction[] {
  const found: Array<{ fn: Node; directive: Node; parent: Node | null }> = [];
  const parents = new WeakMap<object, Node>();

  const walk = (node: Node, parent: Node | null): void => {
    if (!isNode(node)) return;
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
      throw new Error(
        `[Vynn use server] Generator functions are not supported (${moduleKey}).`,
      );
    }

    const token = `${moduleKey}#${ordinal}`;
    const digest = stableDigest(token);
    return {
      ...item,
      ordinal,
      id: `vynn_${digest}`,
      exportName: `__vynn_server_fn_${digest}`,
      parent: parents.get(item.fn) ?? item.parent,
    };
  });
}

export function containsNestedMarkedBoundary(
  marked: MarkedFunction[],
  program: Node,
): boolean {
  const markedNodes = new Set(marked.map((item) => item.fn));
  const parentMap = new WeakMap<object, Node>();
  const walk = (node: Node): void => {
    if (!isNode(node)) return;
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
