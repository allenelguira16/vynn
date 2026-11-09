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
      throw new Error(
        `[Vynn use server] Generator functions are not supported (${moduleKey}).`,
      );
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

function containsNestedMarkedBoundary(
  marked: MarkedFunction[],
  program: AstNode,
): boolean {
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

function getParamsSource(source: string, fn: AstNode): string {
  const params = (fn.params ?? []) as AstNode[];
  return params.map((param) => source.slice(param.start, param.end)).join(", ");
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

function makeExtractedImplementation(source: string, marked: MarkedFunction): string {
  const body = marked.fn.body as AstNode;
  const bodySource =
    source.slice(body.start, marked.directive.start) +
    source.slice(marked.directive.end, body.end);
  const typeParameters = getTypeParametersSource(source, marked.fn);
  const params = getParamsSource(source, marked.fn);
  const asyncPrefix = marked.fn.async ? "async " : "";

  return `export ${asyncPrefix}function ${marked.exportName}${typeParameters}(${params}) ${bodySource}`;
}

function makeReplacement(marked: MarkedFunction, target: ServerFunctionTarget): SourceEdit {
  const { fn, parent } = marked;
  const reference =
    target === "server"
      ? `${CREATE_SERVER_REFERENCE}(${marked.exportName}, ${JSON.stringify(marked.id)})`
      : `${CREATE_SERVER_REFERENCE}(${JSON.stringify(marked.id)})`;

  if (fn.type !== "FunctionDeclaration") {
    return { start: fn.start, end: fn.end, content: reference };
  }

  const identifier = fn.id as AstNode | undefined;
  const name = identifier?.name;
  if (typeof name !== "string" || !name) {
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

  const diagnostics = (parsed as unknown as {
    errors?: Array<{ severity?: string | number; message?: string }>;
    diagnostics?: Array<{ severity?: string | number; message?: string }>;
  }).errors ?? (parsed as unknown as {
    diagnostics?: Array<{ severity?: string | number; message?: string }>;
  }).diagnostics ?? [];
  const fatalErrors = diagnostics.filter(
    (error) =>
      error.severity === "Error" ||
      error.severity === 2 ||
      !("severity" in error),
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

  const edits = marked.map((item) => makeReplacement(item, options.target));
  let code = applyEdits(source, edits);
  if (options.target === "server") {
    const implementations = marked
      .map((item) => makeExtractedImplementation(source, item))
      .join("\n\n");
    code += `\n\n// Vynn extracted server functions\n${implementations}\n`;
  }

  const defaultRuntime =
    options.target === "server"
      ? "vynn/server-functions/server"
      : "vynn/server-functions/client";
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
