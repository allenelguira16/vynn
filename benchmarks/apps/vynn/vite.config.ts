import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

const scenarioEntries = {
  minimal: "./src/Minimal.tsx",
  state: "./src/State.tsx",
  computed: "./src/Computed.tsx",
  event: "./src/Event.tsx",
  counter: "./src/Counter.tsx",
};

function moduleSizeReport() {
  return {
    name: "benchmark-module-size-report",
    apply: "build",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((chunk) => ({
          file: chunk.fileName,
          isEntry: chunk.isEntry,
          modules: Object.entries(chunk.modules)
            .map(([id, module]) => ({
              id,
              renderedLength: module.renderedLength,
              renderedExports: module.renderedExports,
            }))
            .sort((left, right) => right.renderedLength - left.renderedLength),
        }));

      this.emitFile({
        type: "asset",
        fileName: "module-report.json",
        source: JSON.stringify({ chunks }, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [vynn(), moduleSizeReport()],
  resolve: {
    alias: {
      "@benchmark-app": fileURLToPath(
        new URL(scenarioEntries[mode] ?? scenarioEntries.minimal, import.meta.url),
      ),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    manifest: true,
    minify: "oxc",
    sourcemap: false,
    reportCompressedSize: false,
    target: "es2022",
  },
}));
