import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { build, defineConfig, type Plugin } from "vite";
import sitemap from "vite-plugin-sitemap";
import vynn from "vite-plugin-vynn";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const parserWasmBrowser = path.join(
  path.dirname(require.resolve("@oxc-parser/binding-wasm32-wasip1/package.json")),
  "parser.wasip1-browser.js",
);
const transformerWasmBrowser = path.join(
  path.dirname(require.resolve("@oxc-transform/binding-wasm32-wasip1/package.json")),
  "transform.wasip1-browser.js",
);

const playgroundRuntimeModule = "virtual:vynn-playground-runtime";
const resolvedPlaygroundRuntimeModule = `\0${playgroundRuntimeModule}`;

function playgroundRuntimePlugin(): Plugin {
  let runtimeBundle: Promise<string> | undefined;

  const buildRuntime = async (): Promise<string> => {
    const result = await build({
      configFile: false,
      root,
      logLevel: "silent",
      publicDir: false,
      build: {
        write: false,
        target: "esnext",
        lib: {
          entry: path.resolve(root, "src/playground/runtime.ts"),
          formats: ["es"],
          fileName: () => "vynn-runtime.js",
        },
        rolldownOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
    });

    if ("close" in result) {
      await result.close();
      throw new Error("The Vynn playground runtime build unexpectedly started a watcher.");
    }

    const outputs = Array.isArray(result)
      ? result.flatMap((output) => output.output)
      : result.output;
    const runtimeChunk = outputs.find((output) => output.type === "chunk");

    if (!runtimeChunk || runtimeChunk.type !== "chunk") {
      throw new Error("Vite did not generate a Vynn playground runtime bundle.");
    }

    return runtimeChunk.code;
  };

  return {
    name: "vynn-playground-runtime",
    resolveId(id) {
      if (id === playgroundRuntimeModule) return resolvedPlaygroundRuntimeModule;
    },
    async load(id) {
      if (id !== resolvedPlaygroundRuntimeModule) return;

      runtimeBundle ??= buildRuntime();
      const source = await runtimeBundle;

      return `export default ${JSON.stringify(source)};`;
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  optimizeDeps: {
    include: [
      "@shikijs/themes/tokyo-night",
      "@shikijs/langs/tsx",
      "@shikijs/langs/bash",
      "@shikijs/langs/json5",
      "shiki/wasm",
    ],
    exclude: [
      "oxc-parser",
      "@oxc-parser/binding-wasm32-wasip1",
      "@oxc-transform/binding-wasm32-wasip1",
    ],
    rolldownOptions: {
      transform: {
        target: "esnext",
      },
    },
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    rolldownOptions: {
      external: ["vscode-oniguruma"],
    },
  },
  plugins: [
    playgroundRuntimePlugin(),
    vynn({ ssr: true }),
    tailwindcss(),
    sitemap({ hostname: "http://localhost:3000/" }),
  ],
  worker: {
    format: "es",
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@oxc-parser/binding-wasm32-wasip1": parserWasmBrowser,
      "@oxc-transform/binding-wasm32-wasip1": transformerWasmBrowser,
    },
  },
});
