import { describe, expect, it } from "vitest";
import { $attr } from "../src/render/$attr";
import { $head, $headTmpl } from "../src/render/$head";
import { initializeHeadContext } from "../src/context/head-context";
import { attachSsrHead, subscribeSsrHead } from "../src/server/head";
import { $insert } from "../src/render/$insert";
import { $txt } from "../src/render/$txt";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import { setRenderMode } from "../src/context/render-mode";
import { getSsrHead } from "../src/server";
import { renderToServer } from "../src/server/render-to-server";
import { createSSRAsync } from "../src/render/resolve-node";
import type { JSX } from "../src/types/jsx";

describe("JSX head rendering", () => {
  it("serializes metadata into a separate head string and excludes it from body HTML", async () => {
    const rendered = renderToServer(() => {
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

    const body = await rendered;
    const head = getSsrHead(rendered);

    expect(body).toBe("");
    expect(head).toContain('<title head-id="title">Profile | Vynn</title>');
    expect(head).toContain(
      '<meta name="description" content="A Vynn profile." head-id="meta:name:description">',
    );
    expect(head).toContain(
      '<link rel="canonical" href="https://example.com/profile" head-id="link:canonical">',
    );
  });

  it("uses the last active registration for duplicate metadata identities", async () => {
    const rendered = renderToServer(() => {
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

    await rendered;

    const head = getSsrHead(rendered);
    expect(head).toContain('content="Page description"');
    expect(head).not.toContain("Layout description");
  });

  it("emits late head metadata when an SSR async boundary resolves", async () => {
    const rendered = renderToServer(() => {
      return createSSRAsync(
        () => [],
        () => {
          const title = $headTmpl("title");
          $insert(title, $txt("Late stream title"));
          $head(title);

          return [];
        },
        [Promise.resolve()],
      ) as unknown as JSX.Element;
    }, "stream");

    const reader = rendered.getReader();
    const decoder = new TextDecoder();
    let html = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }

    const runtimeIndex = html.indexOf("window.__vynnApplyHeadPatch");
    const patchIndex = html.indexOf("Late stream title");

    expect(runtimeIndex).toBeGreaterThanOrEqual(0);
    expect(patchIndex).toBeGreaterThan(runtimeIndex);
    expect(html).toContain('head-id="title"');
  });

  it("publishes complete snapshots when metadata is registered after subscription", async () => {
    const owner = createOwner();

    runWithOwner(owner, () => {
      setRenderMode("stream");
      const context = initializeHeadContext();
      const result = attachSsrHead({}, context);
      const patches: string[] = [];
      const unsubscribe = subscribeSsrHead(result, (html) =>
        patches.push(html),
      );

      const title = $headTmpl("title");
      $insert(title, $txt("Late page"));
      $head(title);

      expect(patches).toHaveLength(1);
      expect(patches[0]).toContain("<title");
      expect(patches[0]).toContain("Late page");
      expect(Object.getOwnPropertySymbols(result)).toContain(
        Symbol.for("vynn.ssr-head-context"),
      );
      expect(getSsrHead(result)).toContain("Late page");
      unsubscribe();
    });

    disposeOwner(owner);
  });
});
