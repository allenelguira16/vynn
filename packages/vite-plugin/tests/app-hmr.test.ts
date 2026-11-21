import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ResolvedConfig, ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { vynnAppPlugin } from "../src/plugins/app/index.ts";

const temporaryDirectories: string[] = [];

async function createPlugin(withDeployment: boolean) {
  const root = await mkdtemp(join(tmpdir(), "vynn-ssr-hmr-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  const appFile = join(root, "src", "app.tsx");
  await writeFile(appFile, "export default function App() { return null; }", "utf8");

  const plugin = vynnAppPlugin({
    ssr: true,
    ssrMode: "stream",
  });

  const configHook = plugin.config as unknown as (
    userConfig: { root: string },
    env: { command: "serve"; isSsrBuild: false; isPreview: false },
  ) => unknown;
  configHook.call(plugin, { root }, {
    command: "serve",
    isSsrBuild: false,
    isPreview: false,
  });

  const deploymentPlugin = {
    name: "nitro",
    buildApp: { handler: async () => {} },
  };
  const config = {
    root,
    base: "/",
    command: "serve",
    build: { outDir: "dist" },
    plugins: withDeployment ? [deploymentPlugin] : [],
    environments: {
      client: { build: { outDir: "dist/client" } },
      ssr: { build: { outDir: "dist/server" } },
    },
  } as unknown as ResolvedConfig;

  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
  configResolved.call(plugin, config);

  return { plugin, appFile };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Vynn app HMR ownership", () => {
  it("does not restart Vite when an external deployment owns the SSR runtime", async () => {
    const { plugin, appFile } = await createPlugin(true);
    let restartCount = 0;
    const server = {
      restart: async () => {
        restartCount++;
      },
    } as unknown as ViteDevServer;

    const hotUpdate = plugin.hotUpdate as unknown as {
      handler(
        this: { environment: { name: string } },
        options: { file: string; server: ViteDevServer },
      ): unknown;
    };
    const result = hotUpdate.handler.call(
      { environment: { name: "client" } },
      { file: appFile, server },
    );

    expect(result).toBeUndefined();
    expect(restartCount).toBe(0);
  });

  it("still restarts Vite when its built-in SSR runtime owns HMR", async () => {
    const { plugin, appFile } = await createPlugin(false);
    let restartCount = 0;
    const server = {
      restart: async () => {
        restartCount++;
      },
      config: {
        logger: {
          error: () => {},
        },
      },
    } as unknown as ViteDevServer;

    const hotUpdate = plugin.hotUpdate as unknown as {
      handler(
        this: { environment: { name: string } },
        options: { file: string; server: ViteDevServer },
      ): unknown;
    };
    const result = hotUpdate.handler.call(
      { environment: { name: "client" } },
      { file: appFile, server },
    );

    expect(result).toEqual([]);
    await Promise.resolve();
    expect(restartCount).toBe(1);
  });
});
