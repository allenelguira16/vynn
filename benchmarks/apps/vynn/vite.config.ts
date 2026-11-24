import { fileURLToPath } from "node:url";
import { clientChunkReportPlugin } from "../../scripts/client-chunks.mjs";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig(({ mode }) => ({
  logLevel: "silent",
  plugins: [vynn(), clientChunkReportPlugin("vynn", "Vynn")],
  resolve: {
    alias: {
      "@benchmark-app": fileURLToPath(
        new URL(
          mode === "state"
            ? "./src/State.tsx"
            : mode === "counter"
              ? "./src/Counter.tsx"
              : mode === "async"
                ? "./src/Async.tsx"
                : "./src/Minimal.tsx",
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
