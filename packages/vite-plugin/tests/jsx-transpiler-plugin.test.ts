import { describe, expect, it } from "vitest";

import { vynnOxcPlugin } from "../src/plugins/jsx-transpiler.ts";

describe("Vynn Vite JSX adapter", () => {
  it("returns transformed code and a source map", () => {
    const plugin = vynnOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a transform hook.");
    }

    const result = transform.call(
      {} as never,
      "function Page() { return <main>Content</main>; }",
      "/project/src/page.tsx",
    );

    expect(result).toMatchObject({
      code: expect.any(String),
      map: expect.any(Object),
    });
  });


  it("uses the string compiler in the SSR environment", () => {
    const plugin = vynnOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a transform hook.");
    }

    const result = transform.call(
      { environment: { name: "ssr" } } as never,
      `function Page() { return <Await fallback={<Loading />}>Hello</Await>; }`,
      "/project/src/page.tsx",
    );

    expect(result).toMatchObject({
      code: expect.any(String),
      map: null,
    });
    const code = (result as { code: string }).code;
    expect(code).toContain("Await({");
    expect(code).toContain("get fallback()");
    expect(code).toContain("get children()");
    expect(code).toContain("_vynnSsrComponent");
    expect(code).not.toContain("$template");
    expect(code).not.toContain("$insert");
  });

  it("wraps SSR components in modules without JSX", () => {
    const plugin = vynnOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a transform hook.");
    }

    const result = transform.call(
      { environment: { name: "ssr" } } as never,
      "export function Page(props: { children?: string }) { return props.children ?? null; }",
      "/project/src/page.ts",
    );

    expect(result).toMatchObject({ code: expect.any(String), map: null });
    expect((result as { code: string }).code).toContain("Page = _vynnSsrComponent(Page)");
  });
  it("ignores dependencies and modules without JSX", () => {
    const plugin = vynnOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a transform hook.");
    }

    expect(
      transform.call({} as never, "<main />", "/project/node_modules/lib/index.tsx"),
    ).toBeNull();
    expect(transform.call({} as never, "const value = 1;", "/project/src/value.ts")).toBeNull();
  });
});
