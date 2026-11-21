import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { APPLY_HEAD_PATCH_SSR_KEY } from "../src/const";
import { getOwner } from "../src/life-cycle/owner";
import { $registerHead, $registerHeadGroup } from "../src/render/head-runtime";
import { $child, $sibling, $template } from "../src/render/$template";
import { $insert } from "../src/render/$insert";
import { createSSRAsync, createSSRNode } from "../src/render/server/resolve-node";
import { renderToServer } from "../src/server/render-to-server";

describe("JSX head rendering", () => {
  it("serializes a complete document with a marker-free reactive title", () => {
    const rendered = renderToServer(() => {
      const html = $template(
        '<html lang="en"><head><meta charset="utf-8"><title></title></head><body><!--$v0--></body></html>',
      )();
      const head = $child(html);
      const charset = $child(head);
      const title = $sibling(charset);
      const body = $sibling(head);

      $insert(title, ["Vynn SSR Sandbox ", 0] as unknown as JSX.Element);
      $insert(body, "Document body", "0");

      return html as unknown as JSX.Element;
    }, "sync");

    expect(rendered.body).toBe(
      '<html lang="en"><head><meta charset="utf-8"><title>Vynn SSR Sandbox 0</title></head><body>Document body<!--$v0--></body></html>',
    );
    expect(rendered.body).not.toContain("<!--$vs");
    expect(rendered.head.render()).toBe("");
  });

  it("serializes metadata descriptions without creating body elements", async () => {
    const rendered = await renderToServer(() => {
      $registerHead("title", { children: "Profile | Vynn" });
      $registerHead("meta", { name: "description", content: "A Vynn profile." });
      $registerHead("link", { rel: "canonical", href: "https://example.com/profile" });

      return null;
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

  it("keeps a complete HTML document root while serializing metadata separately", () => {
    const rendered = renderToServer(() => {
      const html = createSSRNode("html");
      const head = createSSRNode("head");
      const body = createSSRNode("body");

      $insert(html as unknown as Element, [head, body] as unknown as JSX.Element);
      $registerHead("title", { children: "Vynn application" });
      $registerHead("meta", { name: "description", content: "Full document rendering" });
      $insert(body as unknown as Element, "Document body");

      return html as unknown as JSX.Element;
    }, "sync");

    expect(rendered.body).toBe("<html><head></head><body>Document body</body></html>");
    expect(rendered.head.render()).toContain('<title key="title">Vynn application</title>');
    expect(rendered.head.render()).toContain('name="description"');
  });

  it("uses the last active registration for duplicate metadata identities", async () => {
    const rendered = await renderToServer(() => {
      $registerHead("meta", { name: "description", content: "Layout description" });
      $registerHead("meta", { name: "description", content: "Page description" });
      return null;
    }, "async");

    expect(rendered.head.render()).toContain('name="description"');
    expect(rendered.head.render()).not.toContain("Layout description");
  });

  it("preserves repeated Open Graph image declarations", async () => {
    const rendered = await renderToServer(() => {
      $registerHead("meta", { property: "og:image", content: "/first.jpg" });
      $registerHead("meta", { property: "og:image", content: "/second.jpg" });
      return null;
    }, "async");

    const html = rendered.head.render();
    expect(html.match(/property="og:image"/g)).toHaveLength(2);
    expect(html).toContain('content="/first.jpg"');
    expect(html).toContain('content="/second.jpg"');
  });

  it("replaces inherited singleton values and Open Graph collections as a group", async () => {
    const rendered = await renderToServer(() => {
      $registerHead("meta", { name: "description", content: "Layout description" });
      $registerHead("meta", { property: "og:image", content: "/layout-first.jpg" });
      $registerHead("meta", { property: "og:image", content: "/layout-second.jpg" });

      $registerHeadGroup(() => [
        $registerHead("meta", { name: "description", content: "Page description" }),
        $registerHead("meta", { property: "og:image", content: "/page-first.jpg" }),
        $registerHead("meta", { property: "og:image", content: "/page-second.jpg" }),
      ]);

      return "Page";
    }, "async");

    const html = rendered.head.render();
    expect(html).toContain('content="Page description"');
    expect(html).not.toContain("Layout description");
    expect(html).not.toContain("/layout-first.jpg");
    expect(html).not.toContain("/layout-second.jpg");
    expect(html.match(/property="og:image"/g)).toHaveLength(2);
    expect(html).toContain('data-vynn-head-replace="meta:property:og:image"');
  });

  it("emits late head metadata when an SSR async boundary resolves", async () => {
    const rendered = renderToServer(
      () =>
        createSSRAsync(
          () => [],
          () => {
            $registerHead("title", { children: "Late stream title" });
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

  it("evaluates descriptor getters during server rendering", async () => {
    const rendered = await renderToServer(() => {
      const description = { value: "First description" };
      $registerHead("meta", {
        name: "description",
        get content() {
          return description.value;
        },
      });
      return null;
    }, "async");

    expect(rendered.head.render()).toContain('name="description"');
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
