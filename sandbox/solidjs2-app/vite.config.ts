import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

import { ssrChunkReportPlugin } from "../../benchmarks/scripts/ssr-chunks.mjs";

export default defineConfig({
  plugins: [
    solid({
      start: true,
      ssr: true,
      serverFunctions: true,
    }),
    tailwindcss(),
    compression(),
    ssrChunkReportPlugin("solid", "Solid 2"),
  ],
  preview: {
    port: 3000,
  },
  server: {
    port: 3000,
  },
});
