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
  plugins: [vynn(), tailwindcss(), sitemap({ hostname: "http://localhost:3000/" })],
  resolve: {
    tsconfigPaths: true,
  },
});
