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
  plugins: [vynn(), tailwindcss(), sitemap({ hostname: "http://localhost:4173/" })],
  resolve: {
    tsconfigPaths: true,
  },
});
