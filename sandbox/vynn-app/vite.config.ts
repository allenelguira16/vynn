import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [
    vynn({
      ssr: true,
      ssrMode: "stream",
      serverFunctions: true,
    }),
    tailwindcss(),
  ],
  preview: {
    port: 3000,
  },
  server: {
    port: 3000,
  },
});
