import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import preload from "vite-plugin-preload";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn({ ssr: true }), preload(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
});
