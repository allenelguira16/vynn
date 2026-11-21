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
    expect(result && typeof result === "object" ? result.code : "").toContain('from "vynn/render/client"');

    const ssrResult = transform.call(
      {} as never,
      "function Page() { return <main>Content</main>; }",
      "/project/src/page.tsx",
      { ssr: true } as never,
    );
    expect(ssrResult && typeof ssrResult === "object" ? ssrResult.code : "").toContain(
      'from "vynn/render/server"',
    );
  });

  it("selects the server runtime from the active Vite environment", () => {
    const plugin = vynnOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a transform hook.");
    }

    const result = transform.call(
      {
        environment: {
          config: {
            consumer: "server",
          },
        },
      } as never,
      "function Page() { return <main>Content</main>; }",
      "/project/src/page.tsx",
    );

    expect(result && typeof result === "object" ? result.code : "").toContain(
      'from "vynn/render/server"',
    );
    expect(result && typeof result === "object" ? result.code : "").not.toContain(
      'from "vynn/render/client"',
    );
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
