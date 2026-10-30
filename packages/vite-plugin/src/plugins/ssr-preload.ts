import { isAbsolute, relative } from "node:path";
import { parseSync } from "oxc-parser";
import type { Plugin } from "vite";

export type ViteSsrManifest = Record<string, string[]>;

type AstNode = {
  type?: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

type ImportCandidate = {
  source: string;
};

function cleanId(id: string): string {
  return id.replace(/\\/g, "/").split(/[?#]/, 1)[0];
}

/**
 * Module IDs in Vite's SSR manifest are root-relative. Keep IDs in that same
 * form when they are embedded into a lazy() call by the transform below.
 */
export function normalizeSsrModuleId(id: string, root: string): string | undefined {
  const normalized = cleanId(id);

  if (!normalized || normalized.startsWith("\0")) return undefined;

  if (isAbsolute(normalized)) {
    const relativeId = cleanId(relative(root, normalized));
    if (relativeId && relativeId !== "." && !relativeId.startsWith("../")) {
      return relativeId.replace(/^\.\//, "");
    }
    // Keep outside-root IDs intact. The SSR manifest may contain them, and
    // dev mode can translate absolute filesystem paths to Vite's /@fs URL.
    return normalized;
  }

  return normalized.replace(/^\.\//, "").replace(/^\/+/, "");
}

function isAstNode(value: unknown): value is AstNode {
  return !!value && typeof value === "object" && "type" in value &&
    typeof (value as AstNode).type === "string";
}

function visit(
  node: AstNode,
  callback: (node: AstNode) => void,
): void {
  callback(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "range" || key === "comments" ||
        key === "tokens" || key === "parent") continue;

    if (isAstNode(value)) {
      visit(value, callback);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) visit(item, callback);
      }
    }
  }
}

function findLoaderImport(loader: AstNode): ImportCandidate | undefined {
  const imports: string[] = [];

  function visitLoader(node: AstNode): void {
    if (node.type === "ImportExpression") {
      const source = node.source as AstNode | undefined;
      if (source?.type === "Literal" && typeof source.value === "string") {
        imports.push(source.value);
      } else {
        imports.push("");
      }
      return;
    }

    // Vite may wrap import() in an internal preload callback before this pass
    // runs, so visit nested functions too. More than one import is ambiguous
    // and is intentionally left uninstrumented.
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range" || key === "comments" ||
          key === "tokens" || key === "parent") continue;

      if (isAstNode(value)) {
        visitLoader(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) visitLoader(item);
        }
      }
    }
  }

  visitLoader(loader);

  if (imports.length !== 1 || !imports[0]) return undefined;
  return { source: imports[0] };
}

function getLazyBindingNames(program: AstNode): Set<string> {
  const bindings = new Set<string>();
  const body = program.body as AstNode[] | undefined;

  for (const statement of body ?? []) {
    if (
      statement.type !== "ImportDeclaration" ||
      (statement.source as AstNode | undefined)?.value !== "vynn"
    ) {
      continue;
    }

    for (const specifier of (statement.specifiers as AstNode[] | undefined) ?? []) {
      if (specifier.type !== "ImportSpecifier") continue;

      const imported = specifier.imported as AstNode | undefined;
      const local = specifier.local as AstNode | undefined;
      const importedName =
        imported?.type === "Identifier"
          ? imported.name
          : imported?.type === "Literal"
            ? imported.value
            : undefined;

      if (importedName === "lazy" && typeof local?.name === "string") {
        bindings.add(local.name);
      }
    }
  }

  return bindings;
}
function inferLang(id: string): "js" | "jsx" | "ts" | "tsx" {
  const path = id.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}

/**
 * Attach the resolved client module ID to lazy(() => import("...")) calls.
 * The runtime records that ID only when the lazy component is reached during
 * SSR, so untouched routes do not get preloaded.
 */
export function vynnSsrPreloadPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "vynn:ssr-preload-modules",
    enforce: "post",

    config(_config, env) {
      if (env.command === "build" && !env.isSsrBuild) {
        return { build: { ssrManifest: true } };
      }
      return null;
    },

    configResolved(config) {
      root = config.root;
    },

    async transform(code, id) {
      const filename = id.split(/[?#]/, 1)[0];
      if (
        id.startsWith("\0") ||
        !/\.[cm]?[jt]sx?$/i.test(filename) ||
        !code.includes("lazy") ||
        !/\bimport\s*\(/.test(code)
      ) {
        return null;
      }

      let program: AstNode;
      try {
        const parsed = parseSync(filename, code, {
          lang: inferLang(filename),
          sourceType: "module",
          astType: "ts",
          showSemanticErrors: false,
        });
        if (parsed.errors.some((error) => error.severity === "Error")) {
          return null;
        }
        program = parsed.program as unknown as AstNode;
      } catch {
        // Let Vite's normal parser report source errors. This plugin is only an
        // instrumentation pass and must not hide or replace those diagnostics.
        return null;
      }

      const lazyBindings = getLazyBindingNames(program);
      if (lazyBindings.size === 0) return null;

      const edits: Array<{ position: number; text: string }> = [];
      const calls: AstNode[] = [];

      visit(program, (node) => {
        const callee = node.callee as AstNode | undefined;
        if (
          node.type === "CallExpression" &&
          callee?.type === "Identifier" &&
          typeof callee.name === "string" &&
          lazyBindings.has(callee.name)
        ) {
          calls.push(node);
        }
      });

      for (const call of calls) {
        const args = call.arguments as AstNode[] | undefined;
        if (!args || args.length === 0 || args.length > 2) continue;

        const loader = args[0];
        if (
          !loader ||
          (loader.type !== "ArrowFunctionExpression" &&
            loader.type !== "FunctionExpression")
        ) {
          continue;
        }

        const candidate = findLoaderImport(loader);
        if (!candidate) continue;

        let resolvedId: string | undefined;
        try {
          const resolved = await this.resolve(candidate.source, id, {
            skipSelf: true,
          });
          resolvedId = resolved?.id;
        } catch {
          // A missing/virtual resolution cannot be mapped reliably to the
          // client manifest. Leave the call unchanged instead of guessing.
          continue;
        }

        if (!resolvedId) continue;
        const moduleId = normalizeSsrModuleId(resolvedId, root);
        if (!moduleId) continue;

        const lastArgument = args[args.length - 1];
        if (typeof lastArgument?.end !== "number") continue;

        edits.push({
          position: lastArgument.end,
          text: args.length === 1
            ? `, undefined, ${JSON.stringify(moduleId)}`
            : `, ${JSON.stringify(moduleId)}`,
        });
      }

      if (edits.length === 0) return null;

      let transformed = code;
      edits.sort((left, right) => right.position - left.position);
      for (const edit of edits) {
        transformed =
          transformed.slice(0, edit.position) +
          edit.text +
          transformed.slice(edit.position);
      }

      return { code: transformed, map: null };
    },
  };
}

/** Return the manifest assets belonging only to the modules reached by SSR. */
export function getSsrPreloadAssets(
  moduleIds: Iterable<string>,
  manifest: ViteSsrManifest | null | undefined,
): { js: string[]; css: string[] } {
  const js = new Set<string>();
  const css = new Set<string>();
  if (!manifest) return { js: [], css: [] };

  for (const moduleId of moduleIds) {
    const normalized = cleanId(moduleId).replace(/^\.\//, "");
    const candidates = new Set([
      normalized,
      normalized.replace(/^\/+/, ""),
      `/${normalized.replace(/^\/+/, "")}`,
    ]);
    const key = [...candidates].find((candidate) =>
      Object.prototype.hasOwnProperty.call(manifest, candidate),
    );

    if (!key) continue;

    for (const file of manifest[key] ?? []) {
      if (/\.css(?:$|\?)/i.test(file)) css.add(file);
      else if (/\.(?:m?js|cjs)(?:$|\?)/i.test(file)) js.add(file);
    }
  }

  return { js: [...js], css: [...css] };
}
