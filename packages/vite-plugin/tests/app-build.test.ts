import { describe, expect, it } from "vitest";

import { vynnAppPlugin } from "../src/plugins/app/index.ts";

describe("Vynn app build orchestration", () => {
  it("leaves environment scheduling to Vite's builder", () => {
    const plugin = vynnAppPlugin({
      ssr: true,
      ssrMode: "stream",
    });

    expect(plugin.buildApp).toBeUndefined();
  });
});
