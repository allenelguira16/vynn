import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseSync, visitorKeys } from "oxc-parser";
import type { Plugin, ResolvedConfig } from "vite";

type AstNode = {
  type?: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

type FileRouteMetadata = {
  path: string;
  kind: "page" | "layout";
  beforeLoad: boolean;
};

type SourceEdit = {
  start: number;
  end: number;
  replacement: string;
};

const SCRIPT_EXTENSION_RE = /\.(?:[cm]?[jt]sx?)$/i;
const ROUTE_SOURCE_EXTENSION_RE = /\.(?:js|jsx|ts|tsx|mjs|mts)$/i;
const ROUTE_GLOB = "**/{page,layout}.{js,jsx,ts,tsx,mjs,mts}";

function asNode(value: unknown): AstNode | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const node = value as AstNode;
  return typeof node.type === "string" ? node : undefined;
}

function asNodes(value: unknown): AstNode[] {
  return Array.isArray(value)
    ? value.map(asNode).filter((node): node is AstNode => node !== undefined)
    : [];
}

function getName(value: unknown): string | undefined {
  const node = asNode(value);
  if (!node) return undefined;

  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (
    (node.type === "Literal" || node.type === "StringLiteral") &&
    typeof node.value === "string"
  ) {
    return node.value;
  }

  return undefined;
}

function getStringLiteral(value: unknown): string | undefined {
  const node = asNode(value);
  if (!node) return undefined;

  if (
    (node.type === "Literal" || node.type === "StringLiteral") &&
    typeof node.value === "string"
  ) {
    return node.value;
  }

  return undefined;
}

function visit(node: AstNode, callback: (node: AstNode) => void): void {
  callback(node);

  const keys = (visitorKeys as Record<string, string[]>)[node.type ?? ""] ?? [];

  for (const key of keys) {
    const child = node[key];

    if (Array.isArray(child)) {
      for (const item of child) {
        const childNode = asNode(item);
        if (childNode) visit(childNode, callback);
      }
    } else {
      const childNode = asNode(child);
      if (childNode) visit(childNode, callback);
    }
  }
}

function parseModule(source: string, filePath: string): AstNode {
  const extension = extname(filePath).toLowerCase();
  const lang = extension === ".tsx" || extension === ".mtsx"
    ? "tsx"
    : extension === ".jsx" || extension === ".mjsx"
      ? "jsx"
      : extension === ".ts" || extension === ".mts" || extension === ".cts"
        ? "ts"
        : "js";

  const parsed = parseSync(filePath, source, {
    lang,
    sourceType: "module",
    astType: "js",
    preserveParens: false,
    showSemanticErrors: false,
  } as never) as unknown as { program: AstNode };

  return parsed.program;
}

function getSpecialFileKind(filePath: string): "page" | "layout" | undefined {
  const fileName = filePath.split(/[\\/]/).pop() ?? "";
  if (!ROUTE_SOURCE_EXTENSION_RE.test(fileName)) return undefined;
  if (/\.d\.(?:ts|mts|cts)$/i.test(fileName)) return undefined;

  const specialName = fileName.replace(/\.(?:[cm]?[jt]sx?)$/i, "");
  return specialName === "page" || specialName === "layout" ? specialName : undefined;
}

function getSpecialFileExports(
  source: string,
  filePath: string,
): { hasDefault: boolean; hasBeforeLoad: boolean } {
  const program = parseModule(source, filePath);
  const body = asNodes(program.body);
  let hasDefault = false;
  let hasBeforeLoad = false;

  for (const statement of body) {
    if (statement.type === "ExportDefaultDeclaration") {
      hasDefault = true;
      continue;
    }

    if (statement.type !== "ExportNamedDeclaration") continue;

    const declaration = asNode(statement.declaration);

    if (declaration?.type === "FunctionDeclaration" && getName(declaration.id) === "beforeLoad") {
      hasBeforeLoad = true;
    }

    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of asNodes(declaration.declarations)) {
        if (getName(declarator.id) === "beforeLoad") {
          hasBeforeLoad = true;
        }
      }
    }

    for (const specifier of asNodes(statement.specifiers)) {
      const exportedName = getName(specifier.exported);
      if (exportedName === "default") hasDefault = true;
      if (exportedName === "beforeLoad") hasBeforeLoad = true;
    }
  }

  return { hasDefault, hasBeforeLoad };
}

function isWithinDirectory(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(".." + sep) &&
      !isAbsolute(relativePath))
  );
}

function resolveAppDirectory(directory: string, importer: string, root: string): string {
  const projectRoot = resolve(root);
  let absoluteDirectory: string;

  const absoluteCandidate = isAbsolute(directory) ? resolve(directory) : undefined;
  if (
    absoluteCandidate &&
    existsSync(absoluteCandidate) &&
    isWithinDirectory(projectRoot, absoluteCandidate)
  ) {
    absoluteDirectory = absoluteCandidate;
  } else if (directory.startsWith("/")) {
    // Leading slash paths are Vite-root-relative, e.g. /src/app.
    absoluteDirectory = resolve(projectRoot, "." + directory);
  } else {
    // Relative paths are resolved from the module containing toFileRouter().
    absoluteDirectory = resolve(dirname(importer), directory);
  }

  if (!isWithinDirectory(projectRoot, absoluteDirectory)) {
    throw new Error(
      "[Vynn file router] The app directory must be inside the Vite project root: " +
        JSON.stringify(directory),
    );
  }

  if (!existsSync(absoluteDirectory)) {
    throw new Error(
      "[Vynn file router] App directory does not exist: " + absoluteDirectory,
    );
  }

  return absoluteDirectory;
}

function toViteDirectory(absoluteDirectory: string, root: string): string {
  const relativePath = relative(resolve(root), absoluteDirectory).replace(/\\/g, "/");
  return relativePath ? "/" + relativePath : "/";
}

function discoverRouteModules(
  directory: string,
  root: string,
  addWatchFile?: (filePath: string) => void,
): FileRouteMetadata[] {
  const result: FileRouteMetadata[] = [];

  const visitDirectory = (currentDirectory: string): void => {
    const entries = readdirSync(currentDirectory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

      const absolutePath = resolve(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith("@")) {
          throw new Error(
            "[Vynn file router] Parallel route slots are not supported yet: " +
              JSON.stringify(entry.name) +
              ".",
          );
        }

        if (/^\(\.{1,3}\)/.test(entry.name)) {
          throw new Error(
            "[Vynn file router] Intercepting route folders are not supported yet: " +
              JSON.stringify(entry.name) +
              ".",
          );
        }

        visitDirectory(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;

      const kind = getSpecialFileKind(entry.name);
      if (!kind) continue;

      addWatchFile?.(absolutePath);

      const source = readFileSync(absolutePath, "utf8");
      const exports = getSpecialFileExports(source, absolutePath);

      if (!exports.hasDefault) {
        throw new Error(
          "[Vynn file router] " +
            JSON.stringify(absolutePath) +
            " must have a default component export.",
        );
      }

      result.push({
        path: "/" + relative(root, absolutePath).replace(/\\/g, "/"),
        kind,
        beforeLoad: exports.hasBeforeLoad,
      });
    }
  };

  visitDirectory(directory);

  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function isNodePosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Rewrites toFileRouter("...") calls into static Vite glob imports for page and layout modules.
 *
 * Export inspection is done at transform time so only page modules with a
 * named beforeLoad export receive a route guard. The route module itself is
 * still loaded on demand through import.meta.glob().
 */
export function transformFileRouterCalls(
  source: string,
  id: string,
  root: string,
  addWatchFile?: (filePath: string) => void,
  trackAppDirectory?: (directory: string) => void,
): string | null {
  if (!source.includes("toFileRouter")) return null;

  const cleanId = id.split("?", 1)[0].replace(/\\/g, "/");
  const program = parseModule(source, cleanId);
  const importedNames = new Set<string>();

  visit(program, (node) => {
    if (node.type !== "ImportDeclaration") return;
    if (getStringLiteral(node.source) !== "vynn-router") return;

    for (const specifier of asNodes(node.specifiers)) {
      if (specifier.type !== "ImportSpecifier") continue;
      if (getName(specifier.imported) !== "toFileRouter") continue;

      const localName = getName(specifier.local);
      if (localName) importedNames.add(localName);
    }
  });

  if (importedNames.size === 0) return null;

  const calls: AstNode[] = [];

  visit(program, (node) => {
    if (node.type !== "CallExpression") return;

    const callee = asNode(node.callee);
    if (callee?.type !== "Identifier" || !importedNames.has(getName(callee) ?? "")) return;

    calls.push(node);
  });

  if (calls.length === 0) return null;

  const edits: SourceEdit[] = [];

  for (const call of calls) {
    const args = asNodes(call.arguments);
    const firstArgument = args[0];

    if (!firstArgument || args.length !== 1) {
      throw new Error(
        "[Vynn file router] toFileRouter() expects exactly one static directory string.",
      );
    }

    const directory = getStringLiteral(firstArgument);
    if (!directory) {
      throw new Error(
        "[Vynn file router] The toFileRouter() directory must be a string literal. " +
          "Use a path such as toFileRouter(\"/src/pages\").",
      );
    }

    const callStart = call.start;
    const callEnd = call.end;
    const argumentStart = firstArgument.start;

    if (
      !isNodePosition(callStart) ||
      !isNodePosition(callEnd) ||
      !isNodePosition(argumentStart)
    ) {
      throw new Error("[Vynn file router] Could not locate the toFileRouter() call in source.");
    }

    const absoluteDirectory = resolveAppDirectory(directory, cleanId, root);
    trackAppDirectory?.(absoluteDirectory);
    const viteDirectory = toViteDirectory(absoluteDirectory, root);
    const globPrefix = viteDirectory === "/" ? "" : viteDirectory;
    const globPatterns = [
      globPrefix + "/" + ROUTE_GLOB,
      "!" + globPrefix + "/**/_*/**/{page,layout}.{js,jsx,ts,tsx,mjs,mts}",
    ];
    const files = discoverRouteModules(absoluteDirectory, resolve(root), addWatchFile);
    const prefix = source.slice(callStart, argumentStart);

    edits.push({
      start: callStart,
      end: callEnd,
      replacement:
        prefix +
        JSON.stringify(viteDirectory) +
        ", import.meta.glob(" +
        JSON.stringify(globPatterns) +
        "), " +
        JSON.stringify(files) +
        ")",
    });
  }

  let transformed = source;

  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    transformed =
      transformed.slice(0, edit.start) +
      edit.replacement +
      transformed.slice(edit.end);
  }

  return transformed;
}

/** Vite transform that powers the one-argument toFileRouter() API. */
export function vynnFileRouterPlugin(): Plugin {
  let root = resolve(process.cwd());
  const routeImporters = new Map<string, Set<string>>();

  return {
    name: "vynn-file-router",
    enforce: "pre",

    configResolved(config: ResolvedConfig) {
      root = config.root;
    },

    transform(source, id) {
      const cleanId = id.split("?")[0].replace(/\\/g, "/");
      if (cleanId.startsWith("\0") || cleanId.includes("/node_modules/")) return null;
      if (!SCRIPT_EXTENSION_RE.test(cleanId)) return null;

      for (const importers of routeImporters.values()) {
        importers.delete(cleanId);
      }

      const code = transformFileRouterCalls(
        source,
        cleanId,
        root,
        (filePath) => this.addWatchFile(filePath),
        (directory) => {
          let importers = routeImporters.get(directory);
          if (!importers) {
            importers = new Set<string>();
            routeImporters.set(directory, importers);
          }
          importers.add(cleanId);
        },
      );

      for (const [directory, importers] of routeImporters) {
        if (importers.size === 0) routeImporters.delete(directory);
      }

      return code ? { code, map: null } : null;
    },

    handleHotUpdate({ file, modules, server }) {
      const changedFile = resolve(file);
      const updatedModules = new Set(modules);

      for (const [directory, importers] of routeImporters) {
        if (!isWithinDirectory(directory, changedFile)) continue;

        for (const importer of importers) {
          const module = server.moduleGraph.getModuleById(importer);
          if (!module) continue;

          server.moduleGraph.invalidateModule(module);
          updatedModules.add(module);
        }
      }

      return updatedModules.size === modules.length ? undefined : [...updatedModules];
    },
  };
}
