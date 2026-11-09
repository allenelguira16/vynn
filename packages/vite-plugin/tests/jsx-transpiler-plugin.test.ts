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
