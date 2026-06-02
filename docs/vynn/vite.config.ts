import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import sitemap from "vite-plugin-sitemap";
import vynn from "vite-plugin-vynn";

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
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    rollupOptions: {
      external: ["vscode-oniguruma"], // WASM regex engine Shiki depends on
    },
  },
  plugins: [vynn(), tailwindcss(), sitemap({ hostname: "http://localhost:4173/" })],
  resolve: {
    tsconfigPaths: true,
  },
});
