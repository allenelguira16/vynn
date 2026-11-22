import { describe, expect, it } from "vitest";

import { vynnAppPlugin } from "../src/plugins/app/index.ts";

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
