import type { Plugin, Rolldown } from "vite";

import { transformVynnOxcWithMap, type VynnCompilerOptions } from "vynn-compiler";

export type VynnOxcPluginOptions = VynnCompilerOptions & {
  /** Set false to disable the transform for matching files. */
  enabled?: boolean;
};

/** Vite adapter for the build-tool-independent Vynn JSX compiler. */
export function vynnOxcPlugin(options: VynnOxcPluginOptions = {}): Plugin {
  const { enabled, ...compilerOptions } = options;

  return {
    name: "vynn-jsx-transpiler",
    enforce: "pre",
    transform(source, id, transformOptions) {
      if (enabled === false) return null;
      if (id.includes("node_modules") || id.startsWith("\0")) return null;

      const cleanId = id.split("?", 1)[0];
      if (!/\.(?:[cm]?[jt]sx?)$/i.test(cleanId)) return null;
      if (!source.includes("<")) return null;

      // Vite 6+ exposes the active named environment on the hook context.
      // Prefer its consumer; keep the SSR option as a fallback for older Vite APIs.
      const consumer = this.environment?.config.consumer;
      const runtimeTarget =
        consumer === "server" ||
        this.environment?.name === "ssr" ||
        transformOptions?.ssr === true
          ? "server"
          : "client";

      const result = transformVynnOxcWithMap(source, cleanId, {
        ...compilerOptions,
        runtimeTarget,
      });
      return {
        code: result.code,
        map: result.map as Rolldown.SourceMapInput | null,
      };
    },
  };
}
