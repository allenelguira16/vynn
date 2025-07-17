// import size from "rollup-plugin-size";
import size from "@atomico/rollup-plugin-sizes";
import { defineConfig } from "rollup";
import del from "rollup-plugin-delete";
import dts from "rollup-plugin-dts";
import esbuild from "rollup-plugin-esbuild";
import tsConfigPaths from "rollup-plugin-tsconfig-paths";

const { default: pkg } = await import("./package.json", {
  with: { type: "json" },
});

const input = {
  index: "src/index.tsx",
};

const IS_DEV = process.env.NODE_ENV === "development";

const external = [
  "vynn",
  "vynn/jsx-runtime",
  "vynn/server",
  "vynn/server/jsx-runtime",
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig([
  // Transpile JS/TS files
  {
    input,
    external,
    output: [
      {
        dir: "dist/esm",
        format: "esm",
        sourcemap: true,
        entryFileNames: "[name].jsx",
      },
      {
        dir: "dist/cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
        entryFileNames: "[name].jsx",
      },
    ],
    jsx: {
      mode: "preserve",
      factory: null,
      fragment: null,
      importSource: null,
      preset: null,
    },
    plugins: [
      del({ targets: "dist/*", runOnce: IS_DEV }),
      tsConfigPaths(),
      esbuild({
        tsconfig: "tsconfig.json",
        jsx: "preserve",
        // minify: !IS_DEV,
      }),
      size(),
    ],
  },

  // Generate type declarations
  {
    input,
    external,
    output: {
      dir: "dist/types",
      format: "es",
    },
    plugins: [tsConfigPaths(), dts()],
  },
]);
