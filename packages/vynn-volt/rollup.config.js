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
  client: "src/client.tsx",
  server: "src/server.tsx",
};

const IS_DEV = process.env.NODE_ENV === "development";

const external = [
  "vynn",
  "vynn/jsx-runtime",
  "vynn/server",
  "vynn/server/jsx-runtime",
  "vynn-router",
  "@vinxi/server-functions/plugin",
  "vinxi/fs-router",
  "vinxi/manifest",
  "vinxi/client",
  "vinxi/routes",
  "vinxi/http",
  "node:fs",
  "path",
  "url",
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
        entryFileNames: (chunk) => {
          if (chunk.name === "index") return "[name].js";
          return "[name].jsx";
        },
        chunkFileNames: (chunk) => {
          if (chunk.moduleIds[0].split(".")[1] === "tsx") return "esm/chunks/[name]-[hash].jsx";
          return "esm/chunks/[name]-[hash].js";
        },
      },
      {
        dir: "dist/cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
        entryFileNames: (chunk) => {
          if (chunk.name === "index") return "[name].js";
          return "[name].jsx";
        },
        chunkFileNames: "cjs/chunks/[name]-[hash].js",
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
      // babel({
      //   babelHelpers: "bundled",
      //   presets: [["@babel/preset-vynn", { ssr: true }], "@babel/preset-typescript"],
      //   extensions: [".ts", ".tsx", ".js", ".jsx"],
      // }),
      esbuild({
        tsconfig: "tsconfig.json",
        jsx: "preserve",
        // minify: !IS_DEV,
      }),
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
