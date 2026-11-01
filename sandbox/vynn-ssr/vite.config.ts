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
  // Vynn is a workspace dependency. Externalize it so the host server and
  // Vite's SSR module runner share the same owner runtime instance.
  ssr: {
    external: ["vynn"],
  },
  preview: {
    port: 3000,
  },
  server: {
    port: 3000,
  },
});
