import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.env.SSR": "false",
  },
  build: {
    lib: {
      entry: fileURLToPath(
        new URL("./benchmarks/runtime-entry.ts", import.meta.url),
      ),
      formats: ["es"],
      fileName: "runtime",
    },
    minify: false,
    outDir: "node_modules/.cache/vynn-runtime-bench",
    emptyOutDir: true,
  },
});
