import { defineConfig } from "vite";
import vynnPlugin from "vite-plugin-vynn";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vynnPlugin({ serverFunctions: true }), tailwindcss()],
  preview: {
    port: 3000,
  },
  server: {
    port: 3000,
  },
});
