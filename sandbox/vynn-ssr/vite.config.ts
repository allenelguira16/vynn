import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    vynn({
      ssr: true,
      serverFunctions: true,
    }),
    tailwindcss(),
  ],
});
