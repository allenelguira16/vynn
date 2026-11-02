import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { vynnSsrPreloadPlugin } from "../../vite-plugin/src/plugins/ssr-preload.ts";

import { registerSsrModule } from "../src/context/ssr-module-context";
import { createSSRAsync } from "../src/render/resolve-node";
import { renderToServer } from "../src/server/render-to-server";
import { renderSsrPreloadLinks } from "../src/server/preload.render-preload-links";
import { injectSsrPreloadLinks } from "../src/server/preload.inject-links";

describe("SSR lazy module tracking", () => {
  it("isolates module IDs between independent render results", () => {
    const first = renderToServer(() => {
      registerSsrModule("src/pages/a.tsx");
      return null;
    }, "sync");
    const second = renderToServer(() => {
      registerSsrModule("src/pages/b.tsx");
      return null;
    }, "sync");

    expect([...first.modules]).toEqual(["src/pages/a.tsx"]);
    expect([...second.modules]).toEqual(["src/pages/b.tsx"]);
  });

  it("isolates module IDs between concurrent async renders", async () => {
    const createRender = (moduleId: string) =>
      renderToServer(
        () =>
          createSSRAsync(
            () => [],
            () => {
              registerSsrModule(moduleId);
              return [];
            },
            [Promise.resolve()],
          ) as unknown as JSX.Element,
        "async",
      );

    const [first, second] = await Promise.all([
      createRender("src/pages/first.tsx"),
      createRender("src/pages/second.tsx"),
    ]);

    expect([...first.modules]).toEqual(["src/pages/first.tsx"]);
    expect([...second.modules]).toEqual(["src/pages/second.tsx"]);
  });

  it("keeps the module set live while a stream resolves lazy boundaries", async () => {
    let resolveBoundary!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveBoundary = resolve;
    });

    const rendered = renderToServer(
      () =>
        createSSRAsync(
          () => [],
          () => {
            registerSsrModule("src/pages/lazy.tsx");
            return [];
          },
          [pending],
        ) as unknown as JSX.Element,
      "stream",
    );

    expect([...rendered.modules]).toEqual([]);

    resolveBoundary();
    const reader = rendered.body.getReader();
    while (!(await reader.read()).done) {
      // Drain the stream so the async boundary can finish.
    }

    expect([...rendered.modules]).toEqual(["src/pages/lazy.tsx"]);
  });
});

describe("renderSsrPreloadLinks", () => {
  const manifest = {
    "src/pages/a.tsx": ["assets/a-C5.js", "assets/shared-H2.js", "assets/a-A1.css"],
    "src/pages/b.tsx": ["assets/b-D4.js", "assets/b-B2.css"],
  };

  it("emits assets for reached modules only", () => {
    const links = renderSsrPreloadLinks(new Set(["src/pages/a.tsx"]), manifest, { base: "/" });

    expect(links).toContain('href="/assets/a-C5.js"');
    expect(links).toContain('href="/assets/shared-H2.js"');
    expect(links).toContain('href="/assets/a-A1.css"');
    expect(links).not.toContain("assets/b-D4.js");
    expect(links).not.toContain("assets/b-B2.css");
  });

  it("deduplicates assets across modules and repeated stream chunks", () => {
    const excluded = new Set<string>();
    const first = renderSsrPreloadLinks(new Set(["src/pages/a.tsx"]), manifest, {
      base: "/app/",
      exclude: excluded,
    });
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
    const links = renderSsrPreloadLinks(new Set(["src/pages/a.tsx"]), null, {
      base: "/base/",
      dev: true,
    });

    expect(links).toBe('<link rel="modulepreload" crossorigin href="/base/src/pages/a.tsx">');
    expect(links).not.toContain("vynn:internal");
    expect(links).not.toContain("_$int");
  });

  it("injects pre-delimited preload links without adding marker attributes", () => {
    const links = '<link rel="modulepreload" href="/assets/lazy.js">';
    const script = injectSsrPreloadLinks(links);

    expect(script).toContain("document.createComment(\"vynn:internal:start\")");
    expect(script).toContain("document.createComment(\"vynn:internal:end\")");
    expect(script).toContain("document.head.append(");
    expect(script).toContain("document.currentScript.remove()");
    expect(script).not.toContain("_$int");
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
