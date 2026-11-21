import { describe, expect, it, vi } from "vitest";

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

  it("selects the server runtime when the active environment is named ssr", () => {
    const plugin = vynnOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a transform hook.");
    }

    const result = transform.call(
      {
        environment: {
          name: "ssr",
          config: { consumer: "client" },
        },
      } as never,
      "function Page() { return <main>Content</main>; }",
      "/project/src/page.tsx",
    );

    expect(result && typeof result === "object" ? result.code : "").toContain(
      'from "vynn/render/server"',
    );
  });

  it("resolves the public package entry to the server component entry in SSR", async () => {
    const plugin = vynnOxcPlugin();
    const resolveId = plugin.resolveId;

    if (typeof resolveId !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a resolveId hook.");
    }

    const resolve = vi.fn().mockResolvedValue({
      id: "/workspace/packages/vynn-core/src/index.ts",
    });
    const result = await resolveId.call(
      {
        environment: {
          name: "ssr",
          config: { consumer: "server" },
        },
        resolve,
      } as never,
      "vynn",
      "/workspace/app/src/App.tsx",
    );

    expect(result).toBe("/workspace/packages/vynn-core/src/server-entry.ts");
    expect(resolve).toHaveBeenCalledWith(
      "vynn",
      "/workspace/app/src/App.tsx",
      { skipSelf: true },
    );
  });

  it("leaves the public package entry unchanged in the client environment", async () => {
    const plugin = vynnOxcPlugin();
    const resolveId = plugin.resolveId;

    if (typeof resolveId !== "function") {
      throw new Error("Expected the Vynn Oxc plugin to expose a resolveId hook.");
    }

    const resolve = vi.fn();
    const result = await resolveId.call(
      {
        environment: {
          name: "client",
          config: { consumer: "client" },
        },
        resolve,
      } as never,
      "vynn",
      "/workspace/app/src/App.tsx",
    );

    expect(result).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
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
