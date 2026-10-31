import { describe, expect, it } from "vitest";
import { renderToServer } from "../src/server/render-to-server";
import { createSSRAsync, createSSRText } from "../src/render/resolve-node";
import type { JSX } from "../src/types/jsx";

describe("renderToServer modes", () => {
  it("returns a string in sync mode without wrapping the result", () => {
    const rendered = renderToServer(
      () => createSSRText("Synchronous content") as unknown as JSX.Element,
      "sync",
    );

    expect(typeof rendered).toBe("string");
    expect(rendered).toContain("Synchronous content");
  });

  it("renders an async boundary fallback without waiting in sync mode", () => {
    const rendered = renderToServer(
      () =>
        createSSRAsync(
          () => [createSSRText("Loading")],
          () => [createSSRText("Resolved")],
          [Promise.resolve()],
        ) as unknown as JSX.Element,
      "sync",
    );

    expect(rendered).toContain("Loading");
    expect(rendered).not.toContain("Resolved");
  });

  it("retains the promise return type in async mode", () => {
    const rendered = renderToServer(() => "Async content", "async");
    expect(rendered).toBeInstanceOf(Promise);
  });

  it("retains the readable stream return type in stream mode", () => {
    const rendered = renderToServer(() => "Stream content", "stream");
    expect(rendered).toBeInstanceOf(ReadableStream);
  });
});
