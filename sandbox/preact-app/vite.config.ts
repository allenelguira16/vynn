import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";
import { ssrChunkReportPlugin } from "../../benchmarks/scripts/ssr-chunks.mjs";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "preact",
    },
  },
  plugins: [
    tailwindcss(),
    compression(),
    ssrChunkReportPlugin("preact", "Preact 11"),
  ],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  preview: {
    port: 3001,
  },
  server: {
    port: 3001,
  },
});
