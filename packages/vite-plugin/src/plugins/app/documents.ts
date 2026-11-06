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
  ssr: boolean,
): string {
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
    `if (typeof serverModule.render !== "function") throw new Error("[Vynn App] The entry-server module must export render(url, mode) and return a Vynn SSR render result or Response.");`,
    `export function render(url) { return serverModule.render(url, ${JSON.stringify(ssrMode)}); }`,
    "",
  ].join("\n");
}

export function createServerEntry(
  appSpecifier: string,
  ssrMode: RenderMode = "stream",
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = (moduleName: string) =>
    `Reflect.get(${moduleName}, "default") ?? Reflect.get(${moduleName}, "App")`;

  return [
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

export function createSsrHandlerModule(options: {
  runtimeModuleId: string;
  clientEntryUrl: string;
  css: string[];
  base: string;
  dev: boolean;
  serverFunctions: boolean;
  ssrManifest: ViteSsrManifest | null;
}): string {
  const {
    runtimeModuleId,
    clientEntryUrl,
    css,
    base,
    dev,
    serverFunctions,
    ssrManifest,
  } = options;

  return [
    `import { createSsrHandler } from ${JSON.stringify(runtimeModuleId)};`,
    `import { render } from ${JSON.stringify(SERVER_ENTRY_ID)};`,
    ...(serverFunctions
      ? [`import { handleServerFunctionRequest } from "virtual:vynn/server-functions";`]
      : []),
    `export const handleRequest = createSsrHandler({`,
    `  render,`,
    `  clientEntryUrl: ${JSON.stringify(clientEntryUrl)},`,
    `  css: ${JSON.stringify(css)},`,
    `  base: ${JSON.stringify(base)},`,
    `  dev: ${JSON.stringify(dev)},`,
    `  ssrManifest: ${JSON.stringify(ssrManifest)},`,
    ...(serverFunctions ? [`  handleServerFunctionRequest,`] : []),
    `});`,
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
