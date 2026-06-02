import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn({ ssr: true }), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
});
