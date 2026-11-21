import type { RenderMode } from "vynn";

import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { VynnSsrCssLink } from "../ssr-css.ts";
import type { ViteSsrManifest } from "../ssr-preload.ts";

import { joinAssetBase } from "./http.ts";
import { type ClientAssets, SERVER_ENTRY_ID } from "./shared.ts";

type ManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
  name?: string;
};

export function createClientEntry(appSpecifier: string, ssr: boolean): string {
  const selected = (moduleName: string) =>
    `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;
  const renderer = ssr ? "hydrateToDOM" : "renderToDOM";

  return [
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
    `if (typeof serverModule.render !== "function") throw new Error("[Vynn App] The entry-server module must export render(url, mode, request?) and return a Vynn SSR render result or Response.");`,
    `export function render(url, request) { return serverModule.render(url, ${JSON.stringify(ssrMode)}, request); }`,
    "",
  ].join("\n");
}

export function createServerEntry(appSpecifier: string, ssrMode: RenderMode = "stream"): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = (moduleName: string) =>
    `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;

  return [
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { renderToServerString } from "vynn/server/ssr";`,
    `const App = ${selected("appModule")};`,
    `if (typeof App !== "function") throw new Error("[Vynn App] The app module must export a component as default or App.");`,
    `export function render(url, request) {`,
    `  return renderToServerString(() => App({ url }), ${JSON.stringify(ssrMode)}, request);`,
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

/**
 * Reconciles server-rendered head metadata without changing the authored
 * document-head order. The client template hydrator walks those authored
 * elements in order, so replacing a title must not move it past later links
 * and meta elements.
 */
export function reconcileHeadMarkup(existing: string, incoming: string): string {
  function scan(source: string) {
    const result: Array<{
      start: number;
      end: number;
      tag: string;
      attributes: Record<string, string>;
      html: string;
    }> = [];
    let offset = 0;
    const lower = source.toLowerCase();

    while ((offset = source.indexOf("<", offset)) !== -1) {
      if (source.startsWith("<!--", offset)) {
        const commentEnd = source.indexOf("-->", offset + 4);
        offset = commentEnd === -1 ? source.length : commentEnd + 3;
        continue;
      }

      let end = offset + 1;
      let quote = "";
      while (end < source.length) {
        const character = source[end];
        if (quote) {
          if (character === quote) quote = "";
        } else if (character === '"' || character === "'") {
          quote = character;
        } else if (character === ">") {
          break;
        }
        end++;
      }
      if (end >= source.length) break;

      const opening = source.slice(offset, end + 1);
      const rawTextTag = /^<\\s*(script|style|template)\\b/i.exec(opening);
      if (rawTextTag) {
        const close = lower.indexOf("</" + rawTextTag[1].toLowerCase(), end + 1);
        if (close !== -1) {
          const closeEnd = source.indexOf(">", close);
          offset = closeEnd === -1 ? source.length : closeEnd + 1;
        } else {
          offset = end + 1;
        }
        continue;
      }

      const name = /^<\\s*(title|meta|link)\\b/i.exec(opening);
      if (!name) {
        offset = end + 1;
        continue;
      }

      let finish = end + 1;
      if (name[1].toLowerCase() === "title") {
        const close = lower.indexOf("</title", finish);
        if (close !== -1) {
          const closeEnd = source.indexOf(">", close);
          if (closeEnd !== -1) finish = closeEnd + 1;
        }
      }

      result.push({
        start: offset,
        end: finish,
        tag: name[1].toLowerCase(),
        attributes: parseAttributes(opening),
        html: source.slice(offset, finish),
      });
      offset = finish;
    }

    return result;
  }

  function parseAttributes(opening: string): Record<string, string> {
    const attributes: Record<string, string> = Object.create(null);
    const source = opening.replace(/^<\\s*[A-Za-z][A-Za-z0-9:-]*/, "").replace(/>$/, "");
    const pattern = /([^\\s=/>]+)(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source))) {
      const name = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      attributes[name] = value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }

    return attributes;
  }

  function identity(entry: { tag: string; attributes: Record<string, string> }): string | null {
    const attributes = entry.attributes;
    if (entry.tag === "title") return "title";

    if (entry.tag === "meta") {
      if ("charset" in attributes) return "meta:charset";
      if (attributes.name) return "meta:name:" + attributes.name.toLowerCase();
      if (attributes.property) return "meta:property:" + attributes.property.toLowerCase();
      if (attributes["http-equiv"]) return "meta:http-equiv:" + attributes["http-equiv"].toLowerCase();
    }

    if (entry.tag === "link") {
      const rel = (attributes.rel || "").toLowerCase();
      return rel === "canonical"
        ? "link:canonical"
        : "link:" + rel + ":" + (attributes.href || "");
    }

    return null;
  }

  function collection(entry: { tag: string; attributes: Record<string, string> }): string | null {
    if (entry.tag !== "meta" || !entry.attributes.property) return null;

    const property = entry.attributes.property.toLowerCase();
    for (const root of ["og:image", "og:video", "og:audio", "og:locale:alternate"]) {
      if (property === root || property.indexOf(root + ":") === 0) {
        return "meta:property:" + root;
      }
    }

    return null;
  }

  const current = scan(existing);
  const next = scan(incoming);
  const hasCharset = (entries: ReturnType<typeof scan>) =>
    entries.some((entry) => entry.tag === "meta" && "charset" in entry.attributes);
  const injectCharset = !hasCharset(current) && !hasCharset(next);
  const charsetMarkup = injectCharset
    ? '<meta charset="UTF-8" key="meta:charset">'
    : "";

  const replacedCollections = new Set(
    next.map((entry) => entry.attributes["data-vynn-head-replace"]).filter(Boolean),
  );
  const nextByIdentity = new Map<string, (typeof next)[number]>();
  const nextByCollection = new Map<string, Array<(typeof next)[number]>>();

  for (const entry of next) {
    const collectionKey = collection(entry);
    if (collectionKey) {
      const entries = nextByCollection.get(collectionKey) ?? [];
      entries.push(entry);
      nextByCollection.set(collectionKey, entries);
      continue;
    }

    if (entry.attributes["data-vynn-head-replace"]) continue;
    const key = identity(entry);
    if (key) nextByIdentity.set(key, entry);
  }

  const usedNext = new Set<(typeof next)[number]>();
  const insertedCollections = new Set<string>();
  const restorable: string[] = [];
  let output = "";
  let cursor = 0;

  for (const entry of current) {
    output += existing.slice(cursor, entry.start);

    const collectionKey = collection(entry);
    if (collectionKey && replacedCollections.has(collectionKey)) {
      if (!insertedCollections.has(collectionKey)) {
        for (const replacement of nextByCollection.get(collectionKey) ?? []) {
          output += replacement.html;
          usedNext.add(replacement);
        }
        insertedCollections.add(collectionKey);
      }

      if (!entry.attributes.key && !(entry.tag === "meta" && "charset" in entry.attributes)) {
        restorable.push(entry.html);
      }
      cursor = entry.end;
      continue;
    }

    const key = identity(entry);
    const replacement = key ? nextByIdentity.get(key) : undefined;
    if (replacement) {
      output += replacement.html;
      usedNext.add(replacement);

      if (!entry.attributes.key && !(entry.tag === "meta" && "charset" in entry.attributes)) {
        restorable.push(entry.html);
      }
    } else {
      output += entry.html;
    }

    cursor = entry.end;
  }

  output += existing.slice(cursor);

  const trailing = next
    .filter((entry) => !usedNext.has(entry))
    .map((entry) => entry.html)
    .join("");
  const fallback = restorable.length
    ? '<template data-vynn-head-fallback>' + restorable.join("") + "</template>"
    : "";

  return (charsetMarkup + output + trailing + fallback).replace(
    /\\sdata-vynn-head-replace="[^"]*"/g,
    "",
  );
}

export function createSsrHandlerCode(options: {
  clientEntryUrl: string;
  css: string[];
  base: string;
  dev: boolean;
  serverFunctions: boolean;
  ssrManifest: ViteSsrManifest | null;
  devCssLinks?: VynnSsrCssLink[];
}): string {
  const {
    clientEntryUrl,
    css,
    base,
    dev,
    serverFunctions,
    ssrManifest,
    devCssLinks = [],
  } = options;
  return [
    `import { injectSsrPreloadLinks, renderSsrPreloadLinks } from "vynn/server/ssr";`,
    `import { render } from ${JSON.stringify(SERVER_ENTRY_ID)};`,
    `const DEV_CSS_LINKS = ${JSON.stringify(devCssLinks)};`,
    ...(serverFunctions
      ? [`import { handleServerFunctionRequest } from "virtual:vynn/server-functions";`]
      : []),
    `const CLIENT_ENTRY_URL = ${JSON.stringify(clientEntryUrl)};`,
    `const CSS_ASSETS = ${JSON.stringify(css)};`,
    `const BASE = ${JSON.stringify(base)};`,
    `const IS_DEV = ${JSON.stringify(dev)};`,
    `const SSR_MANIFEST = ${JSON.stringify(ssrManifest)};`,
    `function escapeAttribute(value) { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }`,
    `${reconcileHeadMarkup.toString()}`, 
    `function isWebResponse(value) { return !!value && typeof value === "object" && typeof value.status === "number" && value.headers && typeof value.headers.forEach === "function" && "body" in value && (value.body === null || typeof value.body?.getReader === "function") && typeof value.arrayBuffer === "function"; }`,
    `function assetUrl(path) {`,
    `  const value = String(path).replace(/^\\/+/, "");`,
    `  if (BASE === "./") return "./" + value;`,
    `  if (/^https?:\\/\\//.test(BASE)) return BASE.replace(/\\/$/, "") + "/" + value;`,
    `  const prefix = BASE === "/" ? "" : BASE.replace(/\\/$/, "");`,
    `  return prefix + "/" + value;`,
    `}`,
    `function renderDevCssLinks(links) {`,
    `  return links.map(({ url, id }) => '<link rel="stylesheet" data-vite-dev-id="' + escapeAttribute(id) + '" href="' + escapeAttribute(assetUrl(url + "?direct")) + '">' ).join("");`,
    `}`,
    `function createHeadAssets(devCssLinks, preloadLinks, headHtml, patchRuntime) {`,
    `  const collectedDevCss = renderDevCssLinks(DEV_CSS_LINKS);`,
    `  const css = wrapInternalRange(IS_DEV`,
    `    ? collectedDevCss || renderDevCssLinks(devCssLinks)`,
    `    : CSS_ASSETS.map((file) => '<link rel="stylesheet" href="' + escapeAttribute(assetUrl(file)) + '">' ).join(""));`,
    `  const viteClient = wrapInternalRange(IS_DEV ? '<script type="module" src="' + escapeAttribute(assetUrl("/@vite/client")) + '"></script>' : "");`,
    `  return headHtml + css + wrapInternalRange(preloadLinks) + viteClient + wrapInternalRange(patchRuntime);`,
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
    `        let result;`,
    `        if (firstPending) { firstPending = false; result = first; } else { result = await reader.read(); }`,
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
    `          const headStart = buffer.toLowerCase().indexOf("<head");
          const headOpenEnd = buffer.indexOf(">", headStart) + 1;
          if (headStart === -1 || headOpenEnd === 0) {
            throw new TypeError("[Vynn App] The root document has an invalid <head> element.");
          }
          const existingHead = buffer.slice(headOpenEnd, endHead);
          emit(buffer.slice(0, headOpenEnd) + reconcileHeadMarkup(existingHead, headAssets) + "</head>");`,
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
    `export async function handleRequest(request, devCssLinks = DEV_CSS_LINKS) {`,
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
    `  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });`,
    `  let rendered;`,
    `  try { rendered = await render(url.pathname + url.search, request); }`,
    `  catch (error) { if (isWebResponse(error)) return error; throw error; }`,
    `  if (isWebResponse(rendered)) return rendered;`,
    `  if (!rendered || typeof rendered !== "object" || !("body" in rendered) || !("head" in rendered) || !("modules" in rendered) || typeof rendered.head?.render !== "function") {`,
    `    throw new TypeError("[Vynn App] The server entry render() must return a Vynn SSR render result or Response.");`,
    `  }`,
    `  const responseHeaders = new Headers(headers);
    const renderHeaders = rendered.response?.headers;
    if (renderHeaders) {
      const getSetCookie = renderHeaders.getSetCookie;
      const cookies = typeof getSetCookie === "function" ? getSetCookie.call(renderHeaders) : [];
      renderHeaders.forEach((value, name) => {
        if (name.toLowerCase() !== "set-cookie" && name.toLowerCase() !== "content-type") {
          responseHeaders.set(name, value);
        }
      });
      for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);
      if (cookies.length === 0 && renderHeaders.has("set-cookie")) {
        responseHeaders.append("set-cookie", renderHeaders.get("set-cookie"));
      }
    }
    const responseStatus = rendered.response?.status ?? 200;
    let body;`,
    `  try { body = await peekStream(asReadableStream(rendered.body)); }`,
    `  catch (error) { if (isWebResponse(error)) return error; throw error; }`,
    `  if (request.method === "HEAD") { await body.cancel(); return new Response(null, { status: responseStatus, headers: responseHeaders }); }`,
    `  const headHtml = rendered.head.render();`,
    `  return new Response(withDocument(body, devCssLinks, rendered.modules, headHtml), { status: responseStatus, headers: responseHeaders });`,
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
