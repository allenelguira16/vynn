import solid from "@solidjs/vite-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  logLevel: "silent",
  plugins: [solid()],
  resolve: {
    alias: {
      "@benchmark-app": fileURLToPath(
        new URL(
          mode === "counter"
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
