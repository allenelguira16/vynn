import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    vynn({
      app: { renderMode: "stream" },
      ssr: true,
    }),
    tailwindcss(),
  ],
});
