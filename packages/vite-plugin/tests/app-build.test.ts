import { describe, expect, it } from "vitest";

import { vynnAppPlugin } from "../src/plugins/app/index.ts";
import { createSsrHandlerCode } from "../src/plugins/app/documents.ts";

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
