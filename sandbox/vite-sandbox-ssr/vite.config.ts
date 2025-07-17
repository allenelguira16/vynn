import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [vynn({ ssr: true }), tailwindcss(), tsconfigPaths()],
});
