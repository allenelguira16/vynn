import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    vynn({ start: { renderMode: "stream" }, ssr: true }),
    tailwindcss(),
  ],
});
