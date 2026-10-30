export type SsrClientManifest = Record<string, string[]>;

export type SsrPreloadLinkOptions = {
  base?: string;
  /** Use Vite dev-server URLs rather than hashed manifest assets. */
  dev?: boolean;
  /** Seed with already-linked files; this set is updated in place. */
  exclude?: Set<string>;
};

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
