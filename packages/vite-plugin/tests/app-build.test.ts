import { describe, expect, it } from "vitest";

import vynn from "../src/index.ts";
import { vynnAppPlugin } from "../src/plugins/app/index.ts";
import { createClientEntry, createClientShell, createServerEntry, createSsrHandlerCode } from "../src/plugins/app/documents.ts";

describe("Vynn app build orchestration", () => {
  it("leaves environment scheduling to Vite's builder", () => {
    const plugin = vynnAppPlugin({
      ssr: true,
      ssrMode: "stream",
    });

    expect(plugin.buildApp).toBeUndefined();
  });

  it("does not copy public assets into the SSR output", () => {
    const plugin = vynnAppPlugin({
      ssr: true,
      ssrMode: "stream",
    });

    const configHook = plugin.config as unknown as (
      userConfig: { root?: string },
      env: {
        command: "build";
        mode: "production";
        isSsrBuild: false;
        isPreview: false;
      },
    ) => {
      environments?: {
        client?: { build?: { copyPublicDir?: boolean; ssrManifest?: boolean } };
        ssr?: { build?: { copyPublicDir?: boolean; ssrManifest?: boolean } };
      };
    };

    const config = configHook(
      {},
      {
        command: "build",
        mode: "production",
        isSsrBuild: false,
        isPreview: false,
      },
    );

    expect(config.environments?.ssr?.build?.copyPublicDir).toBe(false);
    expect(config.environments?.ssr?.build?.ssrManifest).toBe(false);
    expect(config.environments?.client?.build?.ssrManifest).toBe(true);
    expect(config.environments?.client?.build?.copyPublicDir).toBeUndefined();
  });
});

describe("Vynn render_new application entries", () => {
  it("generates a document-root mount or hydration client entry", () => {
    const client = createClientEntry("/project/src/App.tsx", false, "new");
    const hydrated = createClientEntry("/project/src/App.tsx", true, "new");

    expect(client).toContain('import { mountRenderNew } from "vynn/render_new";');
    expect(client).toContain("mountRenderNew(document, App({ url:");
    expect(hydrated).toContain('import { hydrateRenderNew } from "vynn/render_new";');
    expect(hydrated).toContain("hydrateRenderNew(document, App({ url:");
    expect(createClientEntry("/project/src/App.tsx", true)).toContain(
      'import { hydrateToDOM } from "vynn/client";',
    );
  });

  it("generates synchronous document SSR output for render_new", () => {
    const code = createServerEntry("/project/src/App.tsx", "stream", "new");

    expect(code).toContain('import { renderTemplateProgramToString } from "vynn/render_new/server";');
    expect(code).toContain("body: renderTemplateProgramToString(App({ url }))");
    expect(code).toContain('head: { render: () => "" }');
    expect(code).toContain("modules: []");
    expect(code).not.toContain('from "vynn/server"');
  });

  it("marks starter document assets as internal ranges for renderer preservation", () => {
    const shell = createClientShell({
      base: "/",
      clientEntryUrl: "/assets/client.js",
      css: ["assets/app.css"],
      dev: false,
    });

    expect(shell).toContain(
      '<!--vynn:internal:start--><meta charset="UTF-8" key="meta:charset"><!--vynn:internal:end-->',
    );
    expect(shell).toContain(
      '<!--vynn:internal:start--><link rel="stylesheet" href="/assets/app.css"><!--vynn:internal:end-->',
    );
    expect(shell).toContain(
      '<!--vynn:internal:start--><script type="module" src="/assets/client.js"></script><!--vynn:internal:end-->',
    );
  });

  it("selects the render_new compiler only when explicitly requested", () => {
    const legacyNames = vynn().map((plugin) => plugin.name);
    const newNames = vynn({ renderer: "new" }).map((plugin) => plugin.name);

    expect(legacyNames).toContain("vynn-jsx-transpiler");
    expect(legacyNames).not.toContain("vynn-render-new-jsx");
    expect(newNames).toContain("vynn-render-new-jsx");
    expect(newNames).not.toContain("vynn-jsx-transpiler");
  });
});

describe("Vynn generated SSR handler", () => {
  it("imports the optional middleware file through its default export", () => {
    const code = createSsrHandlerCode({
      clientEntryUrl: "/assets/entry.js",
      css: [],
      base: "/",
      dev: false,
      serverFunctions: false,
      ssrManifest: null,
      middlewareSpecifier: "/project/src/middleware.ts",
    });

    expect(code).toContain('import middleware from "/project/src/middleware.ts";');
    expect(code).not.toContain("middlewareModule");
    expect(code).toContain("createMiddlewareHandler(middleware,");
  });
});
