import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

export default defineConfig({
  plugins: [
    solid({
      // compiler: "native",
      start: true,
      ssr: true,
      serverFunctions: true,
    }),
    tailwindcss(),
    compression(),
  ],
  preview: {
    port: 3000,
  },
  server: {
    port: 3000,
  },
});
