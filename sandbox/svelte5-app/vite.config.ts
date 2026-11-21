import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      compilerOptions: {
        experimental: { async: true },
      },
    }),
    tailwindcss(),
    compression(),
  ],
  preview: { port: 3000 },
  server: { port: 3000 },
});
