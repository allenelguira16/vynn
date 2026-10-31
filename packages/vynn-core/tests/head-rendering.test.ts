import { describe, expect, it } from "vitest";
import { $attr } from "../src/render/$attr";
import { $head, $headTmpl } from "../src/render/$head";
import { subscribeSsrHead } from "../src/server/head";
import { runWithSsrContext } from "../src/server/ssr-request-context";
import { $insert } from "../src/render/$insert";
import { $txt } from "../src/render/$txt";
import { getSsrHead } from "../src/server";
import { renderToServer } from "../src/server/render-to-server";
import { createSSRAsync } from "../src/render/resolve-node";
import type { JSX } from "../src/types/jsx";

describe("JSX head rendering", () => {
  it("serializes metadata into a separate head string and excludes it from body HTML", async () => {
    await runWithSsrContext(async () => {
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
      const head = getSsrHead();

      expect(body).toBe("");
      expect(head).toContain('<title key="title">Profile | Vynn</title>');
      expect(head).toContain(
        '<meta name="description" content="A Vynn profile." key="meta:name:description">',
      );
      expect(head).toContain(
        '<link rel="canonical" href="https://example.com/profile" key="link:canonical">',
      );
    });
  });

  it("uses the last active registration for duplicate metadata identities", async () => {
    await runWithSsrContext(async () => {
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

      const head = getSsrHead();
      expect(head).toContain('content="Page description"');
      expect(head).not.toContain("Layout description");
    });
  });

  it("emits late head metadata when an SSR async boundary resolves", async () => {
    await runWithSsrContext(async () => {
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
      expect(html).toContain('key="title"');
    });
  });

  it("publishes head snapshots to request-scoped subscribers", async () => {
    await runWithSsrContext(async () => {
      let resolveBoundary!: () => void;
      const pending = new Promise<void>((resolve) => {
        resolveBoundary = resolve;
      });

      const rendered = renderToServer(
        () =>
          createSSRAsync(
            () => [],
            () => {
              const title = $headTmpl("title");
              $insert(title, $txt("Late page"));
              $head(title);

              return [];
            },
            [pending],
          ) as unknown as JSX.Element,
        "stream",
      );

      const patches: string[] = [];
      const unsubscribe = subscribeSsrHead((html) => patches.push(html));
      resolveBoundary();

      const reader = rendered.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(patches.some((html) => html.includes("Late page"))).toBe(true);
      expect(getSsrHead()).toContain("Late page");
      unsubscribe();
    });
  });
});
