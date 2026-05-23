import { defineConfig } from "rollup";
import del from "rollup-plugin-delete";
import dts from "rollup-plugin-dts";
import esbuild from "rollup-plugin-esbuild";
import tsConfigPaths from "rollup-plugin-tsconfig-paths";

const { default: pkg } = await import("./package.json", {
  with: { type: "json" },
});

const input = {
  index: "src/index.ts",
  "jsx-runtime": "src/jsx-runtime.ts",
  server: "src/server/index.ts",
  "server/jsx-runtime": "src/server/jsx-runtime.ts",
  client: "src/client/index.ts",
};

const IS_DEV = process.env.NODE_ENV === "development";

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];

export default defineConfig([
  {
    input,
    external,
    output: [
      {
        dir: "dist",
        format: "esm",
        sourcemap: IS_DEV,
        entryFileNames: "esm/[name].js",
        chunkFileNames: "esm/chunks/[hash].js",
      },
      {
        dir: "dist",
        format: "cjs",
        sourcemap: IS_DEV,
        entryFileNames: "cjs/[name].js",
        chunkFileNames: "cjs/chunks/[hash].js",
      },
    ],
    plugins: [
      del({ targets: "dist/*", runOnce: IS_DEV }),
      tsConfigPaths(),
      // resolve(),
      esbuild({
        tsconfig: "tsconfig.json",
        minify: !IS_DEV,
        sourceMap: IS_DEV,
        jsx: "preserve",
        target: "esnext",
      }),
      // syncViteDynamicImport(),
    ],
  },
  {
    input,
    external,
    output: {
      dir: "dist/types",
      format: "es",
      paths: undefined,
    },
    plugins: [tsConfigPaths(), dts()],
  },
]);

// function syncViteDynamicImport() {
//   return {
//     name: "sync-vite-dynamic-import",
//     renderChunk(code, chunk) {
//       const transformed = code.replace(/\bimport\s*\(([^)]+)\)/g, "import(/* @vite-ignore */ $1)");

//       // If no change, return null so Rollup keeps original map
//       if (transformed === code) return null;

//       return {
//         code: transformed,
//         map: chunk.map ?? null, // re-use Rollup’s generated source map
//       };
//     },
//   };
// }
