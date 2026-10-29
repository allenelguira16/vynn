import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

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
  build: {
    manifest: true,
  },
});
