import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [solid()],
  resolve: {
    alias: {
      "@benchmark-app": fileURLToPath(
        new URL(mode === "counter" ? "./src/Counter.tsx" : "./src/Minimal.tsx", import.meta.url),
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
