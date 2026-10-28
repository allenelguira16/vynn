import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { VYNN_SSR_CSS_URL } from "../ssr-css.ts";
import { SERVER_ENTRY_ID, type ClientAssets } from "./shared.ts";
import { joinAssetBase } from "./http.ts";

type ManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
  name?: string;
};

export const DEV_CSS_URL = VYNN_SSR_CSS_URL;

export function createClientEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  exportName: string | undefined,
  mount: string,
  ssr: boolean,
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = exportName
    ? `Reflect.get(appModule, ${JSON.stringify(exportName)})`
    : 'Reflect.get(appModule, "default") ?? Reflect.get(appModule, "App")';
  const renderer = ssr ? "hydrateToDOM" : "renderToDOM";

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { ${renderer} } from "vynn/client";`,
    `const App = ${selected};`,
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
  const selected = exportName
    ? `Reflect.get(appModule, ${JSON.stringify(exportName)})`
    : 'Reflect.get(appModule, "default") ?? Reflect.get(appModule, "App")';

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { renderToServer } from "vynn/server";`,
    `const App = ${selected};`,
    `if (typeof App !== "function") throw new Error("[Vynn Start] The app module must export a component as default or App (or set start.exportName).");`,
    `export function render(url) {`,
    `  return renderToServer(() => App({ url }), ${JSON.stringify(renderMode)});`,
    `}`,
    "",
  ].join("\n");
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

  return {
    file: entry[1].file,
    css: entry[1].css ?? [],
  };
}

export function createSsrHandlerCode(options: {
  clientEntryUrl: string;
  css: string[];
  base: string;
  title: string;
  mountId: string;
  dev: boolean;
  serverFunctions: boolean;
}): string {
  const { clientEntryUrl, css, base, title, mountId, dev, serverFunctions } =
    options;

  return [
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
    `const DEV_CSS_URL = ${JSON.stringify(DEV_CSS_URL)};`,
    `function escapeAttribute(value) { return String(value).replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }`,
    `function assetUrl(path) {`,
    `  const value = String(path).replace(/^\\/+/, "");`,
    `  if (BASE === "./") return "./" + value;`,
    `  if (/^https?:\\/\\//.test(BASE)) return BASE.replace(/\\/$/, "") + "/" + value;`,
    `  const prefix = BASE === "/" ? "" : BASE.replace(/\\/$/, "");`,
    `  return prefix + "/" + value;`,
    `}`,
    `function documentPrefix() {`,
    `  const css = IS_DEV`,
    `    ? '<link rel="stylesheet" href="' + assetUrl(DEV_CSS_URL) + '">'`,
    `    : CSS_ASSETS.map((file) => '<link rel="stylesheet" href="' + escapeAttribute(assetUrl(file)) + '">').join("");`,
    `  const viteClient = IS_DEV ? '<script type="module" src="' + escapeAttribute(assetUrl("/@vite/client")) + '"></script>' : "";`,
    `  return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + TITLE.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</title>' + css + viteClient + '</head><body><div id="' + escapeAttribute(MOUNT_ID) + '">';`,
    `}`,
    `function asReadableStream(value) {`,
    `  if (value instanceof ReadableStream) return value;`,
    `  if (typeof value === "string") return new Response(value).body;`,
    `  if (value instanceof Uint8Array) return new Response(value).body;`,
    `  throw new TypeError("[Vynn Start] The server entry render() must return a string, Uint8Array, or ReadableStream.");`,
    `}`,
    `function withDocument(body) {`,
    `  const reader = body.getReader();`,
    `  const encoder = new TextEncoder();`,
    `  return new ReadableStream({`,
    `    async start(controller) {`,
    `      controller.enqueue(encoder.encode(documentPrefix()));`,
    `      try {`,
    `        while (true) {`,
    `          const result = await reader.read();`,
    `          if (result.done) break;`,
    `          controller.enqueue(result.value);`,
    `        }`,
    `        controller.enqueue(encoder.encode('</div><script type="module" src="' + escapeAttribute(CLIENT_ENTRY_URL) + '"></script></body></html>'));`,
    `        controller.close();`,
    `      } catch (error) { controller.error(error); }`,
    `      finally { reader.releaseLock(); }`,
    `    },`,
    `    cancel(reason) { return reader.cancel(reason); },`,
    `  });`,
    `}`,
    `export async function handleRequest(request) {`,
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
    `  const result = await render(url.pathname + url.search);`,
    `  if (result instanceof Response) return result;`,
    `  return new Response(withDocument(asReadableStream(result)), { status: 200, headers });`,
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
    `<title>${escapeHtml(options.title)}</title>`,
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
