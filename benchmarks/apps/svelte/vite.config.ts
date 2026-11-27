import { svelte } from "@sveltejs/vite-plugin-svelte";
import { clientChunkReportPlugin } from "../../scripts/client-chunks.mjs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  logLevel: "silent",
  plugins: [svelte(), clientChunkReportPlugin("svelte", "Svelte 5")],
  resolve: {
    alias: {
      "@benchmark-app": fileURLToPath(
        new URL(
          mode === "state"
            ? "./src/State.svelte"
            : mode === "counter"
              ? "./src/Counter.svelte"
              : mode === "async"
                ? "./src/Async.svelte"
                : "./src/Minimal.svelte",
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    manifest: true,
    minify: "oxc",
    sourcemap: false,
    reportCompressedSize: false,
    target: "es2022",
  },
}));
