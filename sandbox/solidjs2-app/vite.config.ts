import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    solid({
      // compiler: "native",
      start: true,
      ssr: true,
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
