import { describe, expect, it } from "vitest";

import { $cmpnt } from "../src/render/$cmpnt";
import type { JSX } from "../src/types/jsx";

import { lazy } from "../src/components/lazy";
import { renderToServer } from "../src/server/render-to-server";

describe("Owner SSR identities", () => {
  it("compresses nested zero-index paths in lazy SSR markers", async () => {
    const LazyProbe = lazy(() =>
      Promise.resolve({
        default: () => "Nested probe",
      }),
    );

    const renderNested = (depth: number): JSX.Element => {
      if (depth === 0) return LazyProbe();
      const Nested = $cmpnt(() => renderNested(depth - 1));
      return Nested();
    };

    const rendered = await renderToServer(() => renderNested(3), "async");

    expect(rendered.body).toContain("<!--l:0~4-->");
    expect(rendered.body).toContain("<!--/l:0~4-->");
  });

  it("uses base36 IDs for lazy siblings beyond index 35", async () => {
    const LazyProbe = lazy(() =>
      Promise.resolve({
        default: (props: { index: number }) => `Probe ${props.index}`,
      }),
    );

    const rendered = await renderToServer(
      () => Array.from({ length: 37 }, (_, index) => LazyProbe({ index })),
      "async",
    );

    expect(rendered.body).toContain("<!--l:0.-->");
    expect(rendered.body).toContain("<!--l:0z-->");
    expect(rendered.body).toContain("<!--l:0A10-->");
    expect(rendered.body).toContain("<!--/l:0A10-->");
    expect(rendered.body).not.toContain("<!--l:0a36-->");
  });
});
