import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [
    vynn({
      ssr: true,
      ssrMode: "stream",
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
