import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { APPLY_HEAD_PATCH_SSR_KEY } from "../src/const";
import { getOwner } from "../src/life-cycle/owner";
import { $attr } from "../src/render/$attr";
import { $head, $headTmpl } from "../src/render/$head";
import { $insert } from "../src/render/$insert";
import { $txt } from "../src/render/$txt";
import { createSSRAsync } from "../src/render/resolve-node";
import { renderToServer } from "../src/server/render-to-server";

describe("JSX head rendering", () => {
  it("serializes metadata into the render result and excludes it from body HTML", async () => {
    const rendered = await renderToServer(() => {
      const title = $headTmpl("title");
      $insert(title, $txt("Profile | Vynn"));
      $head(title);

      const description = $headTmpl("meta");
      $attr(description, "name", "description");
      $attr(description, "content", "A Vynn profile.");
      $head(description);

      const canonical = $headTmpl("link");
      $attr(canonical, "rel", "canonical");
      $attr(canonical, "href", "https://example.com/profile");
      $head(canonical);

      return [title, description, canonical] as unknown as JSX.Element;
    }, "async");

    expect(rendered.body).toBe("");
    expect(rendered.head.render()).toContain('<title key="title">Profile | Vynn</title>');
    expect(rendered.head.render()).toContain(
      '<meta name="description" content="A Vynn profile." key="meta:name:description">',
    );
    expect(rendered.head.render()).toContain(
      '<link rel="canonical" href="https://example.com/profile" key="link:canonical">',
    );
  });

  it("uses the last active registration for duplicate metadata identities", async () => {
    const rendered = await renderToServer(() => {
      const first = $headTmpl("meta");
      $attr(first, "name", "description");
      $attr(first, "content", "Layout description");
      $head(first);

      const second = $headTmpl("meta");
      $attr(second, "name", "description");
      $attr(second, "content", "Page description");
      $head(second);

      return null;
    }, "async");

    expect(rendered.head.render()).toContain('content="Page description"');
    expect(rendered.head.render()).not.toContain("Layout description");
  });

  it("emits late head metadata when an SSR async boundary resolves", async () => {
    const rendered = renderToServer(
      () =>
        createSSRAsync(
          () => [],
          () => {
            const title = $headTmpl("title");
            $insert(title, $txt("Late stream title"));
            $head(title);

            return [];
          },
          [Promise.resolve()],
        ) as unknown as JSX.Element,
      "stream",
    );

    const patches: string[] = [];
    const unsubscribe = rendered.head.subscribe((html) => patches.push(html));
    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    let html = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }

    unsubscribe();

    const runtimeIndex = html.indexOf(`window.${APPLY_HEAD_PATCH_SSR_KEY}`);
    const patchIndex = html.indexOf("Late stream title");

    expect(runtimeIndex).toBeGreaterThanOrEqual(0);
    expect(patchIndex).toBeGreaterThan(runtimeIndex);
    expect(patches.some((value) => value.includes('key="title"'))).toBe(true);
    expect(patches.some((value) => value.includes("Late stream title"))).toBe(true);
  });

  it("creates and disposes one independent Owner for each render", () => {
    let renderOwner: ReturnType<typeof getOwner> = null;

    const rendered = renderToServer(() => {
      renderOwner = getOwner();
      return "Owned render";
    }, "sync");

    expect(rendered.body).toContain("Owned render");
    expect(renderOwner).not.toBeNull();
    expect(renderOwner?.parent).toBeNull();
    expect(renderOwner?.disposed).toBe(true);
  });

  it("disposes the render Owner after async rendering completes", async () => {
    let renderOwner: ReturnType<typeof getOwner> = null;

    const rendered = await renderToServer(() => {
      renderOwner = getOwner();
      return "Async render";
    }, "async");

    expect(rendered.body).toContain("Async render");
    expect(renderOwner?.disposed).toBe(true);
  });

  it("disposes the render Owner after a streamed render completes", async () => {
    let renderOwner: ReturnType<typeof getOwner> = null;

    const rendered = renderToServer(() => {
      renderOwner = getOwner();

      return createSSRAsync(
        () => [],
        () => [],
        [Promise.resolve()],
      ) as unknown as JSX.Element;
    }, "stream");

    const reader = rendered.body.getReader();
    while (!(await reader.read()).done) {
      // Drain the stream until all boundaries have resolved.
    }

    expect(renderOwner?.disposed).toBe(true);
  });

  it("disposes the render Owner when its stream is cancelled", async () => {
    let resolveBoundary!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveBoundary = resolve;
    });
    let renderOwner: ReturnType<typeof getOwner> = null;

    const rendered = renderToServer(() => {
      renderOwner = getOwner();

      return createSSRAsync(
        () => [],
        () => [],
        [pending],
      ) as unknown as JSX.Element;
    }, "stream");

    expect(renderOwner).not.toBeNull();
    expect(renderOwner?.disposed).not.toBe(true);
    await rendered.body.getReader().cancel();
    expect(renderOwner?.disposed).toBe(true);

    resolveBoundary();
  });
});
