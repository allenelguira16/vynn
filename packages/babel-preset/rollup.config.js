import size from "@atomico/rollup-plugin-sizes";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import { defineConfig } from "rollup";
import del from "rollup-plugin-delete";
import dts from "rollup-plugin-dts";
import esbuild from "rollup-plugin-esbuild";

const { default: pkg } = await import("./package.json", {
  with: { type: "json" },
});

const IS_DEV = process.env.NODE_ENV === "development";

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];

export default defineConfig([
  {
    input: "src/index.ts",
    external,
    output: [
      {
        dir: "dist/esm",
        format: "esm",
        sourcemap: true,
      },
      {
        dir: "dist/cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins: [
      del({ targets: "dist/*", runOnce: IS_DEV }),
      json(),
      resolve(),
      commonjs(),
      esbuild({
        tsconfig: "./tsconfig.json",
        minify: !IS_DEV,
      }),
      size(),
    ],
  },
  {
    input: "src/index.ts",
    external,
    output: {
      dir: "dist/types",
      format: "es",
    },
    plugins: [dts()],
  },
]);
