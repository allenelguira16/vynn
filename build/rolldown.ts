import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";

import { dts } from "rolldown-plugin-dts";
import type { Plugin, RolldownOptions } from "rolldown";

const builtinModuleIds = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

const typescriptModuleUrl = import.meta.resolve("typescript");

function packageNameFromId(id: string): string {
  const parts = id.split("/");
  return id.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? id);
}

function externalizePackageDependencies(packageDirectory: string) {
  const manifest = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  const dependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);

  return (id: string) => {
    if (builtinModuleIds.has(id)) return true;

    // Keep relative, absolute, and virtual modules inside the bundle graph.
    if (
      id.startsWith(".") ||
      id.startsWith("/") ||
      id.startsWith("\0") ||
      /^[A-Za-z]:[\\/]/.test(id)
    ) {
      return false;
    }

    return dependencies.has(packageNameFromId(id));
  };
}

/**
 * Apply Vynn's build-tool-independent JSX transform before Rolldown lowers
 * TypeScript and bundles the router package.
 */
function vynnJsxTransformPlugin(): Plugin {
  return {
    name: "vynn-jsx-build-transform",
    async transform(source, id) {
      if (id.includes("/node_modules/") || id.includes("\\node_modules\\")) {
        return null;
      }
      if (id.startsWith("\0")) return null;

      const filename = id.split("?", 1)[0] ?? id;
      if (!/\.[cm]?[jt]sx$/i.test(filename) || !source.includes("<")) {
        return null;
      }

      // Load the compiler only for the package that needs Vynn JSX lowering.
      const { transformVynnOxcWithMap } = await import(
        "../packages/vynn-compiler/src/index.ts"
      );
      const result = transformVynnOxcWithMap(source, filename);
      if (result.code === source && !result.map) return null;

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}

export type PackageBuildOptions = {
  entries: Record<string, string>;
  transformVynnJsx?: boolean;
  /** Preserve internal ESM module boundaries for downstream tree-shaking. */
  preserveModules?: boolean;
  /** Source directory to strip from preserved module output paths. */
  preserveModulesRoot?: string;
};

/**
 * Create a build for the package whose directory is the current working
 * directory. Package-local configs own entries; this helper owns shared
 * output, externalization, and declaration-generation defaults.
 */
export function createPackageBuild({
  entries,
  transformVynnJsx = false,
  preserveModules = false,
  preserveModulesRoot,
}: PackageBuildOptions): RolldownOptions {
  const packageDirectory = process.cwd();
  const buildTsconfig = resolve(packageDirectory, "tsconfig.build.json");

  return {
    cwd: packageDirectory,
    input: entries,
    platform: "neutral",
    tsconfig: buildTsconfig,
    external: externalizePackageDependencies(packageDirectory),
    transform: {
      target: "es2022",
    },
    preserveEntrySignatures: "strict",
    plugins: [
      ...(transformVynnJsx ? [vynnJsxTransformPlugin()] : []),
      dts({
        generator: "tsgo",
        cwd: packageDirectory,
        tsconfig: buildTsconfig,
        sourcemap: false,
        tsgo: {
          moduleUrl: typescriptModuleUrl,
        },
      }),
    ],
    output: {
      dir: resolve(packageDirectory, "dist"),
      format: "es",
      entryFileNames: "[name].js",
      chunkFileNames: "chunks/[name]-[hash].js",
      assetFileNames: "assets/[name]-[hash][extname]",
      sourcemap: true,
      cleanDir: true,
      ...(preserveModules
        ? {
            preserveModules: true,
            ...(preserveModulesRoot ? { preserveModulesRoot } : {}),
          }
        : {}),
    },
  };
}
