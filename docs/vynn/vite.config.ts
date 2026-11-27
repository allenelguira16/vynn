import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
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
  plugins: [
    vynn({ ssr: true, ssrMode: "async" }),
    tailwindcss(),
    nitro({
      preset: "static",
      compressPublicAssets: {
        gzip: true,
        brotli: true,
        zstd: false,
      },
    }),
    sitemap({ hostname: "http://localhost:3000/", outDir: ".output/public" }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
