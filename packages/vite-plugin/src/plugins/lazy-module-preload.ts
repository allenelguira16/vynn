import { extname, relative, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import type { Plugin } from "vite";

type AstNode = Record<string, unknown>;

type LazyCallSite = {
  end: number;
  argumentCount: number;
  specifier: string;
};

export type LazyModulePreloadScanner = {
  plugin: Plugin;
};

function cleanId(id: string): string {
  return id.split(/[?#]/, 1)[0].replace(/\\/g, "/");
}

function isObject(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null;
}

function nodeType(node: AstNode | undefined): string | undefined {
  return typeof node?.type === "string" ? node.type : undefined;
}

function stringValue(node: unknown): string | undefined {
  if (!isObject(node)) return undefined;
  return typeof node.value === "string" ? node.value : undefined;
}

function children(node: AstNode): AstNode[] {
  const result: AstNode[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (
      key === "loc" ||
      key === "range" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments" ||
      key === "parent"
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isObject(child)) result.push(child);
      }
    } else if (isObject(value)) {
      result.push(value);
    }
  }

  return result;
}

function findDynamicImport(node: unknown): string | undefined {
  if (!isObject(node)) return undefined;

  const type = nodeType(node);
  if (type === "ImportExpression") {
    return stringValue(node.source);
  }

  if (
    type === "CallExpression" &&
    isObject(node.callee) &&
    nodeType(node.callee) === "Import"
  ) {
    const args = Array.isArray(node.arguments) ? node.arguments : [];
    return stringValue(args[0]);
  }

  for (const child of children(node)) {
    const specifier = findDynamicImport(child);
    if (specifier) return specifier;
  }

  return undefined;
}

function findLazyCallSites(source: string, id: string): LazyCallSite[] {
  if (!/\b(?:import|lazy)\b/.test(source)) return [];

  const extension = extname(id).toLowerCase();
  const lang =
    extension === ".tsx" || extension === ".tsrx"
      ? "tsx"
      : extension === ".jsx"
        ? "jsx"
        : extension === ".ts" || extension === ".mts" || extension === ".cts"
          ? "ts"
          : "js";

  let program: unknown;
  try {
    const parsed = parseSync(id, source, {
      lang,
      sourceType: "module",
      astType: "ts",
      showSemanticErrors: false,
    });

    if (parsed.errors.some((error) => error.severity === "Error")) return [];
    program = parsed.program;
  } catch {
    return [];
  }

  const sites: LazyCallSite[] = [];
  const visited = new WeakSet<object>();

  function visit(value: unknown): void {
    if (!isObject(value) || visited.has(value)) return;
    visited.add(value);

    if (
      nodeType(value) === "CallExpression" &&
      isObject(value.callee) &&
      nodeType(value.callee) === "Identifier" &&
      value.callee.name === "lazy"
    ) {
      const args = Array.isArray(value.arguments) ? value.arguments : [];
      const specifier = findDynamicImport(args[0]);
      const end = value.end;

      // The third argument is reserved for Vynn's internal source-module ID.
      // Leave calls with an explicit third argument alone to avoid rewriting
      // already annotated source or a future compatible API extension.
      if (
        specifier &&
        typeof end === "number" &&
        args.length < 3
      ) {
        sites.push({
          end,
          argumentCount: args.length,
          specifier,
        });
      }
    }

    for (const child of children(value)) visit(child);
  }

  visit(program);
  return sites.sort((a, b) => b.end - a.end);
}

export function createLazyModulePreloadScanner(): LazyModulePreloadScanner {
  let root = resolve(process.cwd());

  const plugin: Plugin = {
    name: "vynn-lazy-module-ids",
    enforce: "pre",

    configResolved(config) {
      root = resolve(config.root);
    },

    async transform(source, id) {
      const filename = cleanId(id);
      if (
        id.startsWith("\0") ||
        filename.includes("/node_modules/") ||
        !/\.(?:[cm]?[jt]sx?|tsrx)$/i.test(filename)
      ) {
        return null;
      }

      const sites = findLazyCallSites(source, filename);
      if (sites.length === 0) return null;

      const insertions: Array<{ offset: number; text: string }> = [];

      for (const site of sites) {
        const resolved = await this.resolve(site.specifier, id, {
          skipSelf: true,
        });

        if (
          !resolved ||
          resolved.external ||
          resolved.id.startsWith("\0")
        ) {
          continue;
        }

        const target = cleanId(resolved.id);
        const moduleId = relative(root, target).replace(/\\/g, "/");
        if (!moduleId || moduleId.startsWith("../")) continue;

        insertions.push({
          offset: site.end - 1,
          text:
            site.argumentCount === 1
              ? `, undefined, ${JSON.stringify(moduleId)}`
              : `, ${JSON.stringify(moduleId)}`,
        });
      }

      if (insertions.length === 0) return null;

      let code = source;
      for (const insertion of insertions) {
        code =
          code.slice(0, insertion.offset) +
          insertion.text +
          code.slice(insertion.offset);
      }

      return { code, map: null };
    },
  };

  return { plugin };
}
