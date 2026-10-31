import { describe, expect, it } from "vitest";

import {
  getSsrModuleIds,
  initializeSsrModuleContext,
  registerSsrModule,
} from "../src/context/ssr-module-context";
import { renderSsrPreloadLinks } from "../src/server/preload.render-preload-links";
import { runWithSsrContext } from "../src/server/ssr-request-context";
import { createOwner, runWithOwner } from "../src/life-cycle/owner";
import { vynnSsrPreloadPlugin } from "../../vite-plugin/src/plugins/ssr-preload.ts";

describe("SSR lazy module tracking", () => {
  it("isolates module IDs between SSR request contexts", () => {
    const first = runWithSsrContext(() => {
      const owner = createOwner(null);
      runWithOwner(owner, () => {
        initializeSsrModuleContext(new Set<string>());
        registerSsrModule("src/pages/a.tsx");
      });
      return [...getSsrModuleIds()];
    });

    const second = runWithSsrContext(() => {
      const owner = createOwner(null);
      runWithOwner(owner, () => {
        initializeSsrModuleContext(new Set<string>());
        registerSsrModule("src/pages/b.tsx");
      });
      return [...getSsrModuleIds()];
    });

    expect(first).toEqual(["src/pages/a.tsx"]);
    expect(second).toEqual(["src/pages/b.tsx"]);
  });

  it("returns a live module set for streaming SSR", () => {
    runWithSsrContext(() => {
      const modules = new Set<string>();
      initializeSsrModuleContext(modules);

      const captured = getSsrModuleIds();
      modules.add("src/pages/lazy.tsx");

      expect([...captured]).toEqual(["src/pages/lazy.tsx"]);
    });
  });
});

describe("renderSsrPreloadLinks", () => {
  const manifest = {
    "src/pages/a.tsx": [
      "assets/a-C5.js",
      "assets/shared-H2.js",
      "assets/a-A1.css",
    ],
    "src/pages/b.tsx": ["assets/b-D4.js", "assets/b-B2.css"],
  };

  it("emits assets for reached modules only", () => {
    const links = renderSsrPreloadLinks(
      new Set(["src/pages/a.tsx"]),
      manifest,
      { base: "/" },
    );

    expect(links).toContain('href="/assets/a-C5.js"');
    expect(links).toContain('href="/assets/shared-H2.js"');
    expect(links).toContain('href="/assets/a-A1.css"');
    expect(links).not.toContain("assets/b-D4.js");
    expect(links).not.toContain("assets/b-B2.css");
  });

  it("deduplicates assets across modules and repeated stream chunks", () => {
    const excluded = new Set<string>();
    const first = renderSsrPreloadLinks(
      new Set(["src/pages/a.tsx"]),
      manifest,
      { base: "/app/", exclude: excluded },
    );
    const second = renderSsrPreloadLinks(
      new Set(["src/pages/a.tsx", "src/pages/b.tsx"]),
      manifest,
      { base: "/app/", exclude: excluded },
    );

    expect(first.match(/rel="modulepreload"/g)).toHaveLength(2);
    expect(second).toContain("/app/assets/b-D4.js");
    expect(second).toContain("/app/assets/b-B2.css");
    expect(second).not.toContain("assets/a-C5.js");
    expect(second).not.toContain("assets/shared-H2.js");
  });

  it("uses Vite module URLs in development without a manifest", () => {
    const links = renderSsrPreloadLinks(
      new Set(["src/pages/a.tsx"]),
      null,
      { base: "/base/", dev: true },
    );

    expect(links).toBe(
      '<link rel="modulepreload" crossorigin href="/base/src/pages/a.tsx">',
    );
  });

  it("escapes paths when emitting link attributes", () => {
    const links = renderSsrPreloadLinks(
      new Set(["src/pages/a.tsx"]),
      {
        "src/pages/a.tsx": ['assets/a.js?x=1&y="><script>'],
      },
      { base: "/" },
    );

    expect(links).toContain("&amp;y=&quot;&gt;&lt;script&gt;");
  });
});

describe("vynnSsrPreloadPlugin", () => {
  it("attaches the resolved target module ID to an ordinary lazy import", async () => {
    const plugin = vynnSsrPreloadPlugin();
    const configure = plugin.configResolved as unknown as (config: { root: string }) => void;
    configure({ root: "/project" });
    const transform = plugin.transform as unknown as (
      this: {
        resolve: (
          source: string,
          importer: string,
          options: { skipSelf: boolean },
        ) => Promise<{ id: string } | null>;
      },
      code: string,
      id: string,
    ) => Promise<{ code: string; map: unknown } | null>;

    const code =
      'import { lazy } from "vynn"; const LazyPage = lazy(() => import("./pages/lazy"));';
    const result = await transform.call(
      {
        resolve: async () => ({ id: "/project/src/pages/lazy.tsx" }),
      },
      code,
      "/project/src/App.tsx",
    );

    expect(result?.code).toContain(
      'lazy(() => import("./pages/lazy"), undefined, "src/pages/lazy.tsx")',
    );
  });

  it("preserves a named lazy export while adding the module ID", async () => {
    const plugin = vynnSsrPreloadPlugin();
    const configure = plugin.configResolved as unknown as (config: { root: string }) => void;
    configure({ root: "/project" });
    const transform = plugin.transform as unknown as (
      this: {
        resolve: (
          source: string,
          importer: string,
          options: { skipSelf: boolean },
        ) => Promise<{ id: string } | null>;
      },
      code: string,
      id: string,
    ) => Promise<{ code: string; map: unknown } | null>;

    const code =
      'import { lazy } from "vynn"; const LazyPage = lazy(() => import("./pages/lazy"), "Page");';
    const result = await transform.call(
      {
        resolve: async () => ({ id: "/project/src/pages/lazy.tsx" }),
      },
      code,
      "/project/src/App.tsx",
    );

    expect(result?.code).toContain(
      'lazy(() => import("./pages/lazy"), "Page", "src/pages/lazy.tsx")',
    );
  });
});
