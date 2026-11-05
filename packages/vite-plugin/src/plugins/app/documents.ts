import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { RenderMode } from "vynn";
import type { ViteSsrManifest } from "../ssr-preload.ts";

import { joinAssetBase } from "./http.ts";
import { type ClientAssets, SERVER_ENTRY_ID } from "./shared.ts";

type ManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
  name?: string;
};

export function createClientEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  ssr: boolean,
): string {
  const selected = (moduleName: string) =>
    `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;
  const renderer = ssr ? "hydrateToDOM" : "renderToDOM";

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { ${renderer} } from "vynn/client";`,
    `const App = ${selected("appModule")};`,
    `if (typeof App !== "function") throw new Error("[Vynn App] The app module must export a component as default or App.");`,
    `${renderer}(() => App({ url: window.location.pathname + window.location.search }), document);`,
    "",
  ].join("\n");
}
export function createAuthoredServerEntry(
  serverSpecifier: string,
  ssrMode: RenderMode = "stream",
): string {
  return [
    `import * as serverModule from ${JSON.stringify(serverSpecifier)};`,
    `if (typeof serverModule.render !== "function") throw new Error("[Vynn App] The entry-server module must export render(url, mode) and return a Vynn SSR render result or Response.");`,
    `export function render(url) { return serverModule.render(url, ${JSON.stringify(ssrMode)}); }`,
    "",
  ].join("\n");
}

export function createServerEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  ssrMode: RenderMode = "stream",
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = (moduleName: string) =>
    `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { renderToServer } from "vynn/server";`,
    `const App = ${selected("appModule")};`,
    `if (typeof App !== "function") throw new Error("[Vynn App] The app module must export a component as default or App.");`,
    `export function render(url) {`,
    `  return renderToServer(() => App({ url }), ${JSON.stringify(ssrMode)});`,
    `}`,
    "",
  ].join("\n");
}

export async function readSsrManifest(outDir: string): Promise<ViteSsrManifest> {
  const manifestPath = resolve(outDir, ".vite/ssr-manifest.json");
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as ViteSsrManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[Vynn App] Could not read the client SSR manifest at ${manifestPath}. Ensure the client build enables build.ssrManifest and completes before the SSR build. Original error: ${message}`,
    );
  }
}

export async function readClientAssets(outDir: string): Promise<ClientAssets> {
  const manifestPath = resolve(outDir, ".vite/manifest.json");
  let manifest: Record<string, ManifestEntry>;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, ManifestEntry>;
  } catch (error) {
    throw new Error(
      `[Vynn App] Could not read the client manifest at ${manifestPath}. The client environment must build before the SSR environment. Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = Object.entries(manifest);
  const entry =
    entries.find(([, item]) => item.isEntry && item.name === "client") ??
    entries.find(
      ([key, item]) => item.isEntry && /client-entry|virtual:vynn\/client-entry/.test(key),
    ) ??
    entries.find(([, item]) => item.isEntry);

  if (!entry) {
    throw new Error(`[Vynn App] No client entry was found in ${manifestPath}.`);
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

async function findCssAssets(outDir: string, directory = outDir): Promise<string[]> {
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
  dev: boolean;
  serverFunctions: boolean;
  ssrManifest: ViteSsrManifest | null;
}): string {
  const { clientEntryUrl, css, base, dev, serverFunctions, ssrManifest } = options;

  return [
    `import { injectSsrPreloadLinks, renderSsrPreloadLinks } from "vynn/server";`,
    `import { render } from ${JSON.stringify(SERVER_ENTRY_ID)};`,
    ...(serverFunctions
      ? [`import { handleServerFunctionRequest } from "virtual:vynn/server-functions";`]
      : []),
    `const CLIENT_ENTRY_URL = ${JSON.stringify(clientEntryUrl)};`,
    `const CSS_ASSETS = ${JSON.stringify(css)};`,
    `const BASE = ${JSON.stringify(base)};`,
    `const IS_DEV = ${JSON.stringify(dev)};`,
    `const SSR_MANIFEST = ${JSON.stringify(ssrManifest)};`,
    `function escapeAttribute(value) { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }`,
    `function wrapInternalRange(value) { return value ? "<!--vynn:internal:start-->" + value + "<!--vynn:internal:end-->" : ""; }`,
    `function assetUrl(path) {`,
    `  const value = String(path).replace(/^\\/+/, "");`,
    `  if (BASE === "./") return "./" + value;`,
    `  if (/^https?:\\/\\//.test(BASE)) return BASE.replace(/\\/$/, "") + "/" + value;`,
    `  const prefix = BASE === "/" ? "" : BASE.replace(/\\/$/, "");`,
    `  return prefix + "/" + value;`,
    `}`,
    `function createHeadAssets(devCssLinks, preloadLinks, headHtml, patchRuntime) {`,
    `  const charset = headHtml.toLowerCase().includes("charset=") ? "" : wrapInternalRange('<meta charset="UTF-8">');`,
    `  const css = wrapInternalRange(IS_DEV`,
    `    ? devCssLinks.map(({ url, id }) => '<link rel="stylesheet" data-vite-dev-id="' + escapeAttribute(id) + '" href="' + escapeAttribute(assetUrl(url + "?direct")) + '">' ).join("")`,
    `    : CSS_ASSETS.map((file) => '<link rel="stylesheet" href="' + escapeAttribute(assetUrl(file)) + '">' ).join(""));`,
    `  const viteClient = wrapInternalRange(IS_DEV ? '<script type="module" src="' + escapeAttribute(assetUrl("/@vite/client")) + '"></script>' : "");`,
    `  return charset + headHtml + css + wrapInternalRange(preloadLinks) + viteClient + wrapInternalRange(patchRuntime);`,
    `}`,
    `function asReadableStream(value) {`,
    `  if (value instanceof ReadableStream) return value;`,
    `  if (typeof value === "string") return new Response(value).body;`,
    `  if (value instanceof Uint8Array) return new Response(value).body;`,
    `  throw new TypeError("[Vynn App] The SSR render result body must be a string, Uint8Array, or ReadableStream.");`,
    `}`,
    `async function peekStream(body) {`,
    `  const reader = body.getReader();`,
    `  let first;`,
    `  try { first = await reader.read(); } catch (error) { reader.releaseLock(); throw error; }`,
    `  let firstPending = true;`,
    `  let released = false;`,
    `  const release = () => { if (!released) { released = true; reader.releaseLock(); } };`,
    `  return new ReadableStream({`,
    `    async pull(controller) {`,
    `      try {`,
    `        let result;\`,\n    \`        if (firstPending) { firstPending = false; result = first; } else { result = await reader.read(); }`,
    `        if (result.done) { controller.close(); release(); return; }`,
    `        controller.enqueue(result.value);`,
    `      } catch (error) { release(); controller.error(error); }`,
    `    },`,
    `    async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } },`,
    `  });`,
    `}`,
    `function withDocument(body, devCssLinks, moduleIds, headHtml) {`,
    `  const reader = body.getReader();`,
    `  const decoder = new TextDecoder();`,
    `  const encoder = new TextEncoder();`,
    `  const seenPreloads = new Set(CSS_ASSETS);`,
    `  const preloadLinks = () => renderSsrPreloadLinks(moduleIds, SSR_MANIFEST, { base: BASE, dev: IS_DEV, exclude: seenPreloads });`,
    `  const clientEntry = '<script type="module" src="' + escapeAttribute(CLIENT_ENTRY_URL) + '"></script>';`,
    `  let buffer = "";`,
    `  let foundHtml = false;`,
    `  let injectedHead = false;`,
    `  let removedBodyClose = false;`,
    `  let removedHtmlClose = false;`,
    `  let headAssets = "";`,
    `  return new ReadableStream({`,
    `    async start(controller) {`,
    `      const emit = (value) => { if (value) controller.enqueue(encoder.encode(value)); };`,
    `      function flushDocumentBody(final) {`,
    `        if (!removedBodyClose) {`,
    `          const endBody = buffer.toLowerCase().indexOf("</body>");`,
    `          if (endBody === -1) {`,
    `            if (final) throw new TypeError("[Vynn App] The root document is missing a closing </body> tag.");`,
    `            const safeLength = Math.max(0, buffer.length - 7);`,
    `            emit(buffer.slice(0, safeLength));`,
    `            buffer = buffer.slice(safeLength);`,
    `            return;`,
    `          }`,
    `          emit(buffer.slice(0, endBody));`,
    `          buffer = buffer.slice(endBody + 7);`,
    `          removedBodyClose = true;`,
    `        }`,
    `        if (!removedHtmlClose) {`,
    `          const endHtml = buffer.toLowerCase().indexOf("</html>");`,
    `          if (endHtml === -1) {`,
    `            if (final) throw new TypeError("[Vynn App] The root document is missing a closing </html> tag.");`,
    `            const safeLength = Math.max(0, buffer.length - 7);`,
    `            emit(buffer.slice(0, safeLength));`,
    `            buffer = buffer.slice(safeLength);`,
    `            return;`,
    `          }`,
    `          emit(buffer.slice(0, endHtml));`,
    `          buffer = buffer.slice(endHtml + 7);`,
    `          removedHtmlClose = true;`,
    `        }`,
    `        if (removedHtmlClose && buffer) { emit(buffer); buffer = ""; }`,
    `      }`,
    `      function transform(text, final = false) {`,
    `        buffer += text;`,
    `        if (!foundHtml) {`,
    `          const match = /<html(?:\\s|>)/i.exec(buffer);`,
    `          if (!match) {`,
    `            if (final) throw new TypeError("[Vynn App] The root component must render a complete <html> document.");`,
    `            return;`,
    `          }`,
    `          let prefix = buffer.slice(0, match.index);`,
    `          const doctype = /<!doctype\\s+html[^>]*>/i.exec(prefix);`,
    `          emit(doctype ? doctype[0] : "<!doctype html>");`,
    `          if (doctype) prefix = prefix.replace(doctype[0], "");`,
    `          const patchRuntime = prefix.trim();`,
    `          headAssets = createHeadAssets(devCssLinks, preloadLinks(), headHtml, patchRuntime);`,
    `          buffer = buffer.slice(match.index);`,
    `          foundHtml = true;`,
    `        }`,
    `        if (!injectedHead) {`,
    `          const endHead = buffer.toLowerCase().indexOf("</head>");`,
    `          if (endHead === -1) {`,
    `            if (final) throw new TypeError("[Vynn App] The root document is missing a closing </head> tag.");`,
    `            return;`,
    `          }`,
    `          emit(buffer.slice(0, endHead) + headAssets + "</head>");`,
    `          buffer = buffer.slice(endHead + 7);`,
    `          injectedHead = true;`,
    `        }`,
    `        flushDocumentBody(final);`,
    `      }`,
    `      try {`,
    `        while (true) {`,
    `          const result = await reader.read();`,
    `          if (result.done) break;`,
    `          const links = injectedHead ? preloadLinks() : "";`,
    `          if (links) emit(injectSsrPreloadLinks(links));`,
    `          transform(decoder.decode(result.value, { stream: true }));`,
    `        }`,
    `        transform(decoder.decode(), true);`,
    `        if (!foundHtml || !injectedHead || !removedBodyClose || !removedHtmlClose) {`,
    `          throw new TypeError("[Vynn App] Could not inject assets into the root HTML document.");`,
    `        }`,
    `        emit(wrapInternalRange(clientEntry) + "</body></html>");`,
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
    `  let rendered;`,
    `  try { rendered = await render(url.pathname + url.search); }`,
    `  catch (error) { if (error instanceof Response) return error; throw error; }`,
    `  if (rendered instanceof Response) return rendered;`,
    `  if (!rendered || typeof rendered !== "object" || !("body" in rendered) || !("head" in rendered) || !("modules" in rendered) || typeof rendered.head?.render !== "function") {`,
    `    throw new TypeError("[Vynn App] The server entry render() must return a Vynn SSR render result or Response.");`,
    `  }`,
    `  const headHtml = rendered.head.render();`,
    `  let body;`,
    `  try { body = await peekStream(asReadableStream(rendered.body)); }`,
    `  catch (error) { if (error instanceof Response) return error; throw error; }`,
    `  return new Response(withDocument(body, devCssLinks, rendered.modules, headHtml), { status: 200, headers });`,
    `}`,
    `export default { fetch(request) { return handleRequest(request); } };`,
    "",
  ].join("\n");
}

export function createClientShell(options: {
  base: string;
  clientEntryUrl: string;
  css?: string[];
  dev: boolean;
}): string {
  const css = options.dev
    ? ""
    : (options.css ?? [])
        .map(
          (file) =>
            `<link rel="stylesheet" href="${escapeHtml(joinAssetBase(options.base, `/${file}`))}">`,
        )
        .join("");
  const viteClient = options.dev
    ? `<script type="module" src="${escapeHtml(joinAssetBase(options.base, "/@vite/client"))}"></script>`
    : "";

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="UTF-8" key="meta:charset">',
    css,
    viteClient,
    "</head>",
    "<body>",
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
