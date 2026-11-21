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
    async resolveId(source, importer) {
      if (source !== "vynn") return null;

      const consumer = this.environment?.config.consumer;
      if (consumer !== "server" && this.environment?.name !== "ssr") return null;

      // Resolve the package's normal public entry first, then switch only its
      // entry file. This keeps all internal imports package-manager agnostic.
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved || resolved.external) return null;

      const resolvedId = resolved.id.split("?", 1)[0];
      const clientEntrySuffix = "/src/index.ts";
      if (!resolvedId.endsWith(clientEntrySuffix)) return null;

      return resolvedId.slice(0, -"/index.ts".length) + "/server-entry.ts";
    },
    transform(source, id, transformOptions) {
      if (enabled === false) return null;
      if (id.includes("node_modules") || id.startsWith("\0")) return null;

      const cleanId = id.split("?", 1)[0];
      if (!/\.(?:[cm]?[jt]sx?)$/i.test(cleanId)) return null;
      if (!source.includes("<")) return null;

      // Prefer the environment consumer. The default Vite SSR environment name
      // and the legacy hook flag cover configurations without a server consumer.
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
