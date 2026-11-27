import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";
import vynn from "vite-plugin-vynn";
import { ssrChunkReportPlugin } from "../../benchmarks/scripts/ssr-chunks.mjs";

export default defineConfig({
  plugins: [
    vynn({
      ssr: true,
      ssrMode: "stream",
      serverFunctions: true,
    }),
    tailwindcss(),
    compression(),
    ssrChunkReportPlugin("vynn", "Vynn"),
  ],
  preview: {
    port: 3000,
  },
  server: {
    port: 3000,
  },
});
