import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig(({ mode }) => ({
  plugins: [vynn()],
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
