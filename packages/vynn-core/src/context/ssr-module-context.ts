import { getContext, setContext } from "../life-cycle/owner";

const SSR_MODULES = Symbol.for("vynn.ssr-modules");

export function initializeSsrModuleContext(modules: Set<string>) {
  setContext(SSR_MODULES, modules);
}

/** Record a lazy module only when its component is reached during SSR. */
export function registerSsrModule(moduleId: string | undefined) {
  if (!moduleId) return;
  getContext<Set<string>>(SSR_MODULES)?.add(moduleId);
}

const SSR_RESULT_MODULES = Symbol.for("vynn.ssr-module-ids");

/** Associate the collected modules with a result, across bundled runtime copies. */
export function attachSsrModules<T extends object>(
  result: T,
  modules: Set<string>,
): T {
  Object.defineProperty(result, SSR_RESULT_MODULES, {
    configurable: false,
    enumerable: false,
    value: modules,
    writable: false,
  });
  return result;
}

/** Return the live set, so streaming SSR can see lazy modules discovered later. */
export function getSsrModuleIds(result: unknown): ReadonlySet<string> {
  if (
    (typeof result !== "object" && typeof result !== "function") ||
    result === null
  ) {
    return new Set<string>();
  }

  const modules = (result as { [key: symbol]: unknown })[SSR_RESULT_MODULES];
  if (
    modules &&
    typeof modules === "object" &&
    typeof (modules as ReadonlySet<string>).has === "function" &&
    typeof (modules as ReadonlySet<string>)[Symbol.iterator] === "function"
  ) {
    return modules as ReadonlySet<string>;
  }

  return new Set<string>();
}

export type SsrClientManifest = Record<string, string[]>;

export type SsrPreloadLinkOptions = {
  base?: string;
  /** Use Vite dev-server URLs rather than hashed manifest assets. */
  dev?: boolean;
  /** Seed with already-linked files; this set is updated in place. */
  exclude?: Set<string>;
};

function cleanModuleId(value: string): string {
  return value.replace(/\\/g, "/").split(/[?#]/, 1)[0];
}

function joinAssetBase(base: string, file: string): string {
  if (/^https?:\/\//i.test(file)) return file;

  const path = file.replace(/^\/+/, "");
  if (base === "./") return "./" + path;
  if (/^https?:\/\//i.test(base)) {
    return base.replace(/\/+$/, "") + "/" + path;
  }

  const prefix = base === "/" ? "" : "/" + base.replace(/^\/+|\/+$/g, "");
  return prefix + "/" + path;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function findManifestAssets(
  moduleId: string,
  manifest: SsrClientManifest,
): string[] {
  const normalized = cleanModuleId(moduleId).replace(/^\.\//, "");
  const candidates = [
    normalized,
    normalized.replace(/^\/+/, ""),
    "/" + normalized.replace(/^\/+/, ""),
  ];

  for (const candidate of candidates) {
    const assets = manifest[candidate];
    if (assets) return assets;
  }

  return [];
}

/**
 * Render preload/link tags for only the module IDs reached by one SSR render.
 * For streaming SSR, call this before each emitted chunk with the same exclude
 * Set to emit links for newly discovered nested lazy modules without duplicates.
 */
export function renderSsrPreloadLinks(
  moduleIds: Iterable<string>,
  manifest: SsrClientManifest | null | undefined,
  options: SsrPreloadLinkOptions = {},
): string {
  const base = options.base ?? "/";
  const seen = options.exclude ?? new Set<string>();
  const stylesheets = new Set<string>();
  const modules = new Set<string>();

  for (const rawId of moduleIds) {
    const id = cleanModuleId(rawId);
    if (!id) continue;

    if (options.dev) {
      if (seen.has(id)) continue;
      seen.add(id);

      let url = id;
      if (/^[A-Za-z]:\//.test(url)) {
        url = "/@fs/" + url;
      } else if (url.startsWith("/") && !url.startsWith("/@")) {
        url = "/@fs" + url;
      } else if (!url.startsWith("/")) {
        url = "/" + url;
      }

      modules.add(url);
      continue;
    }

    if (!manifest) continue;

    for (const file of findManifestAssets(id, manifest)) {
      if (seen.has(file)) continue;
      seen.add(file);

      if (/\.css(?:$|\?)/i.test(file)) {
        stylesheets.add(file);
      } else if (/\.(?:m?js|cjs)(?:$|\?)/i.test(file)) {
        modules.add(file);
      }
    }
  }

  return [
    ...[...stylesheets].map(
      (file) =>
        '<link rel="stylesheet" href="' +
        escapeAttribute(joinAssetBase(base, file)) +
        '">',
    ),
    ...[...modules].map(
      (file) =>
        '<link rel="modulepreload" crossorigin href="' +
        escapeAttribute(joinAssetBase(base, file)) +
        '">',
    ),
  ].join("");
}

/**
 * Place newly discovered preload links in document.head from a streamed HTML
 * response without leaving link elements inside the hydrated application root.
 */
export function injectSsrPreloadLinks(links: string): string {
  if (!links) return "";
  const serialized = JSON.stringify(links);
  return (
    '<script>(function(){var template=document.createElement("template");' +
    "template.innerHTML=" + serialized +
    ';document.head.appendChild(template.content);document.currentScript.remove()})()</script>'
  );
}
