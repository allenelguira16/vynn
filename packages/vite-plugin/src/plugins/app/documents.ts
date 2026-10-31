import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { SERVER_ENTRY_ID, type ClientAssets } from "./shared.ts";
import { joinAssetBase } from "./http.ts";
import type { ViteSsrManifest } from "../ssr-preload.ts";

type ManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
  name?: string;
};

export function createClientEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  exportName: string | undefined,
  mount: string,
  ssr: boolean,
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = (moduleName: string) =>
    exportName
      ? `Reflect.get(${moduleName}, ${JSON.stringify(exportName)})`
      : `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;
  const renderer = ssr ? "hydrateToDOM" : "renderToDOM";

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { ${renderer} } from "vynn/client";`,
    `const App = ${selected("appModule")};`,
    `if (typeof App !== "function") throw new Error("[Vynn Start] The app module must export a component as default or App (or set start.exportName).");`,
    `${renderer}(() => App({ url: window.location.pathname + window.location.search }), ${JSON.stringify(mount)});`,
    "",
  ].join("\n");
}

export function createAuthoredServerEntry(serverSpecifier: string): string {
  return [
    `import * as serverModule from ${JSON.stringify(serverSpecifier)};`,
    `if (typeof serverModule.render !== "function") throw new Error("[Vynn Start] The entry-server module must export render(url).");`,
    `export function render(url) { return serverModule.render(url); }`,
    "",
  ].join("\n");
}

export function createServerEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  exportName: string | undefined,
  renderMode: "async" | "stream",
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = (moduleName: string) =>
    exportName
      ? `Reflect.get(${moduleName}, ${JSON.stringify(exportName)})`
      : `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { renderToServer } from "vynn/server";`,
    `const App = ${selected("appModule")};`,
    `if (typeof App !== "function") throw new Error("[Vynn Start] The app module must export a component as default or App (or set start.exportName).");`,
    `export function render(url) {`,
    `  return renderToServer(() => App({ url }), ${JSON.stringify(renderMode)});`,
    `}`,
    "",
  ].join("\n");
}

export async function readSsrManifest(
  outDir: string,
): Promise<ViteSsrManifest> {
  const manifestPath = resolve(outDir, ".vite/ssr-manifest.json");
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as ViteSsrManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[Vynn Start] Could not read the client SSR manifest at ${manifestPath}. Ensure the client build enables build.ssrManifest and completes before the SSR build. Original error: ${message}`,
    );
  }
}

export async function readClientAssets(outDir: string): Promise<ClientAssets> {
  const manifestPath = resolve(outDir, ".vite/manifest.json");
  let manifest: Record<string, ManifestEntry>;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      ManifestEntry
    >;
  } catch (error) {
    throw new Error(
      `[Vynn Start] Could not read the client manifest at ${manifestPath}. The client environment must build before the SSR environment. Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = Object.entries(manifest);
  const entry =
    entries.find(([, item]) => item.isEntry && item.name === "client") ??
    entries.find(
      ([key, item]) =>
        item.isEntry && /client-entry|virtual:vynn\/client-entry/.test(key),
    ) ??
    entries.find(([, item]) => item.isEntry);

  if (!entry) {
    throw new Error(
      `[Vynn Start] No client entry was found in ${manifestPath}.`,
    );
  }

  // Prefer the CSS associated with the selected entry. When CSS code
  // splitting is disabled (or a bundler emits CSS as a standalone manifest
  // asset), the JS entry's css list may be empty even though CSS was emitted.
  const css = new Set(entry[1].css ?? []);
  if (css.size === 0) {
    for (const item of Object.values(manifest)) {
      if (/\.css$/i.test(item.file)) css.add(item.file);
      for (const stylesheet of item.css ?? []) css.add(stylesheet);
    }
  }
  if (css.size === 0) {
    for (const stylesheet of await findCssAssets(outDir)) css.add(stylesheet);
  }

  return {
    file: entry[1].file,
    css: [...css],
  };
}

async function findCssAssets(
  outDir: string,
  directory = outDir,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const stylesheets: string[] = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      stylesheets.push(...(await findCssAssets(outDir, path)));
    } else if (entry.isFile() && /\.css$/i.test(entry.name)) {
      stylesheets.push(relative(outDir, path).replace(/\\/g, "/"));
    }
  }

  return stylesheets;
}

export function createSsrHandlerCode(options: {
  clientEntryUrl: string;
  css: string[];
  base: string;
  title: string;
  mountId: string;
  dev: boolean;
  serverFunctions: boolean;
  ssrManifest: ViteSsrManifest | null;
}): string {
  const {
    clientEntryUrl,
    css,
    base,
    title,
    mountId,
    dev,
    serverFunctions,
    ssrManifest,
  } = options;

  return [
    `import {`,
    `  getSsrHead,`,
    `  getSsrModuleIds,`,
    `  injectSsrPreloadLinks,`,
    `  renderSsrPreloadLinks,`,
    `} from "vynn/server";`,
    `import { render } from ${JSON.stringify(SERVER_ENTRY_ID)};`,
    ...(serverFunctions
      ? [
          `import { handleServerFunctionRequest } from "virtual:vynn/server-functions";`,
        ]
      : []),
    `const CLIENT_ENTRY_URL = ${JSON.stringify(clientEntryUrl)};`,
    `const CSS_ASSETS = ${JSON.stringify(css)};`,
    `const BASE = ${JSON.stringify(base)};`,
    `const TITLE = ${JSON.stringify(title)};`,
    `const MOUNT_ID = ${JSON.stringify(mountId)};`,
    `const IS_DEV = ${JSON.stringify(dev)};`,
    `const SSR_MANIFEST = ${JSON.stringify(ssrManifest)};`,
    `function escapeAttribute(value) { return String(value).replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }`,
    `function assetUrl(path) {`,
    `  const value = String(path).replace(/^\\/+/, "");`,
    `  if (BASE === "./") return "./" + value;`,
    `  if (/^https?:\\/\\//.test(BASE)) return BASE.replace(/\\/$/, "") + "/" + value;`,
    `  const prefix = BASE === "/" ? "" : BASE.replace(/\\/$/, "");`,
    `  return prefix + "/" + value;`,
    `}`,
    `function documentPrefix(devCssLinks = [], preloadLinks = "", headHtml = "") {`,
    `  const css = IS_DEV`,
    `    ? devCssLinks.map(({ url, id }) => '<link rel="stylesheet" data-vite-dev-id="' + escapeAttribute(id) + '" href="' + escapeAttribute(assetUrl(url + "?direct")) + '">').join("")`,
    `    : CSS_ASSETS.map((file) => '<link rel="stylesheet" href="' + escapeAttribute(assetUrl(file)) + '">').join("");`,
    `  const viteClient = IS_DEV ? '<script type="module" src="' + escapeAttribute(assetUrl("/@vite/client")) + '"></script>' : "";`,
    `  const defaults = (headHtml.toLowerCase().includes("charset=") ? "" : '<meta charset="UTF-8">') + (headHtml.toLowerCase().includes('name="viewport"') ? "" : '<meta name="viewport" content="width=device-width, initial-scale=1.0">') + (headHtml.toLowerCase().includes("<title") ? "" : '<title head-id="title">' + TITLE.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</title>');`,
    `  return '<!doctype html><html lang="en"><head>' + defaults + headHtml + css + preloadLinks + viteClient + '</head><body><div id="' + escapeAttribute(MOUNT_ID) + '">';`,
    `}`,
    `function asReadableStream(value) {`,
    `  if (value instanceof ReadableStream) return value;`,
    `  if (typeof value === "string") return new Response(value).body;`,
    `  if (value instanceof Uint8Array) return new Response(value).body;`,
    `  throw new TypeError("[Vynn Start] The server entry render() must return a string, Uint8Array, or ReadableStream.");`,
    `}`,
    `function withDocument(body, devCssLinks, moduleIds, headHtml) {`,
    `  const reader = body.getReader();`,
    `  const encoder = new TextEncoder();`,
    `  const seenPreloads = new Set(CSS_ASSETS);`,
    `  const preloadLinks = () => renderSsrPreloadLinks(moduleIds, SSR_MANIFEST, { base: BASE, dev: IS_DEV, exclude: seenPreloads });`,
    `  return new ReadableStream({`,
    `    async start(controller) {`,
    `      try {`,
    `        let result = await reader.read();`,
    `        controller.enqueue(encoder.encode(documentPrefix(devCssLinks, preloadLinks(), headHtml)));`,
    `        while (!result.done) {`,
    `          const links = preloadLinks();`,
    `          if (links) controller.enqueue(encoder.encode(injectSsrPreloadLinks(links)));`,
    `          controller.enqueue(result.value);`,
    `          result = await reader.read();`,
    `        }`,
    `        controller.enqueue(encoder.encode('</div><script type="module" src="' + escapeAttribute(CLIENT_ENTRY_URL) + '"></script></body></html>'));`,
    `        controller.close();`,
    `      } catch (error) { controller.error(error); }`,
    `      finally { reader.releaseLock(); }`,
    `    },`,
    `    cancel(reason) { return reader.cancel(reason); },`,
    `  });`,
    `}`,
    `export async function handleRequest(request, devCssLinks = []) {`,
    ...(serverFunctions
      ? [
          `  const serverFunctionResponse = await handleServerFunctionRequest(request);`,
          `  if (serverFunctionResponse) return serverFunctionResponse;`,
        ]
      : []),
    `  if (request.method !== "GET" && request.method !== "HEAD") {`,
    `    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });`,
    `  }`,
    `  const url = new URL(request.url);`,
    `  const headers = { "content-type": "text/html; charset=utf-8" };`,
    `  if (request.method === "HEAD") return new Response(null, { status: 200, headers });`,
    `  const rendered = render(url.pathname + url.search);`,
    `  const moduleIds = getSsrModuleIds(rendered);`,
    `  const result = await rendered;`,
    `  if (result instanceof Response) return result;`,
    `  const headHtml = getSsrHead(rendered);`,
    `  return new Response(withDocument(asReadableStream(result), devCssLinks, moduleIds, headHtml), { status: 200, headers });`,
    `}`,
    `export default { fetch(request) { return handleRequest(request); } };`,
    "",
  ].join("\n");
}

export function createClientShell(options: {
  base: string;
  title: string;
  mountId: string;
  clientEntryUrl: string;
  css?: string[];
  dev: boolean;
}): string {
  const css = options.dev
    ? ""
    : (options.css ?? [])
        .map(
          (file) =>
            `<link rel="stylesheet" href="${escapeHtml(
              joinAssetBase(options.base, `/${file}`),
            )}">`,
        )
        .join("");
  const viteClient = options.dev
    ? `<script type="module" src="${escapeHtml(joinAssetBase(options.base, "/@vite/client"))}"></script>`
    : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title head-id="title">${escapeHtml(options.title)}</title>`,
    css,
    viteClient,
    "</head>",
    "<body>",
    `<div id="${escapeHtml(options.mountId)}"></div>`,
    `<script type="module" src="${escapeHtml(options.clientEntryUrl)}"></script>`,
    "</body>",
    "</html>",
  ].join("");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
