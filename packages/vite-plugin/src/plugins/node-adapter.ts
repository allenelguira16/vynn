import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { Plugin } from "vite";

const NODE_ENTRY = [
  'import { createListener as createNodeListener } from "vynn/server/node";',
  'import { handleRequest } from "./index.js";',
  "export { handleRequest };",
  "export const listener = createNodeListener(handleRequest);",
  "export function createListener(options) {",
  "  return createNodeListener(handleRequest, options);",
  "}",
  "",
].join("\n");

const NODE_TYPES = [
  'import type { NodeListener, NodeListenerOptions } from "vynn/server/node";',
  "export declare function handleRequest(request: Request): Promise<Response>;",
  "export declare const listener: NodeListener;",
  "export declare function createListener(options?: NodeListenerOptions): NodeListener;",
  "",
].join("\n");

/**
 * Emits a Node transport entry beside the universal Fetch SSR handler.
 * The adapter delegates all application work to handleRequest().
 */
export function vynnNodeAdapterPlugin(): Plugin {
  let isBuild = false;
  let projectRoot = process.cwd();

  return {
    name: "vynn-node-server-adapter",

    configResolved(config) {
      isBuild = config.command === "build";
      projectRoot = config.root;
    },

    async writeBundle(outputOptions) {
      if (!isBuild) return;

      const environment = (
        this as unknown as {
          environment?: {
            config?: {
              consumer?: string;
              build?: { outDir?: string };
            };
          };
        }
      ).environment;

      if (environment?.config?.consumer !== "server") return;

      const configuredOutDir =
        outputOptions.dir ?? environment.config.build?.outDir;

      if (!configuredOutDir) {
        this.error(
          "[Vynn] Could not determine the SSR output directory for the Node adapter.",
        );
      }

      const outDir = isAbsolute(configuredOutDir)
        ? configuredOutDir
        : resolve(projectRoot, configuredOutDir);

      await mkdir(outDir, { recursive: true });

      await Promise.all([
        writeFile(resolve(outDir, "node.js"), NODE_ENTRY, "utf8"),
        writeFile(resolve(outDir, "node.d.ts"), NODE_TYPES, "utf8"),
        writeFile(
          resolve(outDir, "package.json"),
          JSON.stringify({ type: "module" }, null, 2) + "\n",
          "utf8",
        ),
      ]);
    },
  };
}
