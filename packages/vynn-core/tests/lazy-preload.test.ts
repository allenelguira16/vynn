import { describe, expect, it } from "vitest";
import type { JSX } from "../src/types/jsx";
import { lazy } from "../src/components/lazy";
import {
  getServerRenderLazyModules,
  renderToServer,
} from "../src/server/render-to-server";

describe("lazy module preload", () => {
  it("loads and caches a component module without rendering it", async () => {
    let loaderCalls = 0;
    let renderCalls = 0;

    const Component = (_props: never): JSX.Element => {
      renderCalls++;
      return null as unknown as JSX.Element;
    };

    const Lazy = lazy(() => {
      loaderCalls++;
      return Promise.resolve({ default: Component });
    });

    const first = Lazy.preload();
    const second = Lazy.preload();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(Component);
    expect(loaderCalls).toBe(1);
    expect(renderCalls).toBe(0);
  });

  it("preloads a named component export", async () => {
    const Page = (_props: never): JSX.Element =>
      null as unknown as JSX.Element;
    const LazyPage = lazy(() => Promise.resolve({ Page }), "Page");

    await expect(LazyPage.preload()).resolves.toBe(Page);
  });

  it("tracks only lazy components used by an SSR render", async () => {
    const Component = (_props: never): JSX.Element =>
      null as unknown as JSX.Element;

    const lazyWithModuleId = lazy as unknown as (
      loader: () => Promise<{ default: typeof Component }>,
      namedExport: "default",
      moduleId: string,
    ) => ReturnType<typeof lazy>;

    const UsedPage = lazyWithModuleId(
      () => Promise.resolve({ default: Component }),
      "default",
      "src/pages/used.tsx",
    );
    const UnusedPage = lazyWithModuleId(
      () => Promise.resolve({ default: Component }),
      "default",
      "src/pages/unused.tsx",
    );

    void UnusedPage;
    const renderResult = renderToServer(
      () => UsedPage({} as never),
      "async",
    ) as Promise<string>;
    const usedModules = getServerRenderLazyModules(renderResult);

    expect([...usedModules]).toEqual(["src/pages/used.tsx"]);
    await expect(renderResult).resolves.toContain("<!--l:");
    expect([...usedModules]).not.toContain("src/pages/unused.tsx");
  });
});
