import { describe, expect, it } from "vitest";

import { vynnRenderNewOxcPlugin } from "../src/plugins/render-new-transpiler";

describe("Vynn render_new Vite JSX adapter", () => {
  it("uses the render_new compiler without invoking the legacy renderer", () => {
    const plugin = vynnRenderNewOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the render_new plugin to expose a transform hook.");
    }

    const result = transform.call(
      {} as never,
      `function Page(props) { return <main>{props.value}</main>; }`,
      "/project/src/page.tsx",
    ) as { code: string; map: unknown } | null;

    expect(result?.code).toContain("__vynn_render_new_child_0_start__");
    expect(result?.code).toContain('kind: "child"');
    expect(result?.code).not.toContain('from "vynn/render"');
  });

  it("does not transform dependencies, ignored modules, or non-JSX files", () => {
    const plugin = vynnRenderNewOxcPlugin();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the render_new plugin to expose a transform hook.");
    }

    expect(
      transform.call({} as never, "<main />", "/project/node_modules/lib/index.tsx"),
    ).toBeNull();
    expect(
      transform.call({} as never, "<main />", "\0virtual:page.tsx"),
    ).toBeNull();
    expect(
      transform.call({} as never, "const value = 1;", "/project/src/value.ts"),
    ).toBeNull();
  });

  it("can be disabled without affecting the legacy plugin", () => {
    const plugin = vynnRenderNewOxcPlugin({ enabled: false });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("Expected the render_new plugin to expose a transform hook.");
    }

    expect(
      transform.call({} as never, "function Page() { return <main />; }", "/project/src/page.tsx"),
    ).toBeNull();
  });
});
