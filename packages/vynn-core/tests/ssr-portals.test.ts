import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { Await } from "../src/components/await";
import { Portal } from "../src/components/portal";
import { $attr } from "../src/render/$attr";
import { $insert } from "../src/render/$insert";
import { $tmpl } from "../src/render/$tmpl";
import { $txt } from "../src/render/$txt";
import { $async } from "../src/reactivity/$async";
import { createSSRAsync, createSSRText } from "../src/render/resolve-node";
import { renderToServer } from "../src/server/render-to-server";

function createPortalApp(children: () => JSX.Element = () => {
  const paragraph = $tmpl("p");
  $insert(paragraph, $txt("Portal content"));
  return paragraph as unknown as JSX.Element;
}): () => JSX.Element {
  return () => {
    const portal = Portal({
      mount: "#portal-root",
      children: children(),
    });

    const root = $tmpl("div");
    const outlet = $tmpl("aside");
    $attr(outlet, "id", "portal-root");

    $insert(root, () => [portal, outlet] as unknown as JSX.Element);

    return root as unknown as JSX.Element;
  };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

describe("SSR Portals", () => {
  it("moves portal children into an ID-selected SSR target in sync mode", () => {
    const rendered = renderToServer(createPortalApp(), "sync");

    expect(rendered.body).toBe(
      '<div><aside id="portal-root"><p>Portal content</p></aside></div>',
    );
  });

  it("moves portal children into an ID-selected SSR target in async mode", async () => {
    const rendered = await renderToServer(createPortalApp(), "async");

    expect(rendered.body).toBe(
      '<div><aside id="portal-root"><p>Portal content</p></aside></div>',
    );
  });

  it("moves portal children into an ID-selected SSR target in stream mode", async () => {
    const rendered = renderToServer(createPortalApp(), "stream");
    const html = await readStream(rendered.body);

    expect(html).toContain(
      '<div><aside id="portal-root"><p>Portal content</p></aside></div>',
    );
  });

  it("resolves async children inside the portal target in async mode", async () => {
    const rendered = await renderToServer(
      createPortalApp(() =>
        createSSRAsync(
          () => [createSSRText("Loading portal content")],
          () => [createSSRText("Resolved portal content")],
          [Promise.resolve()],
        ) as unknown as JSX.Element,
      ),
      "async",
    );

    expect(rendered.body).toContain('<aside id="portal-root">Resolved portal content</aside>');
    expect(rendered.body).not.toContain("Loading portal content");
  });

  it("streams async children inside the portal target", async () => {
    const rendered = renderToServer(
      createPortalApp(() =>
        createSSRAsync(
          () => [createSSRText("Loading portal content")],
          () => [createSSRText("Resolved portal content")],
          [Promise.resolve()],
        ) as unknown as JSX.Element,
      ),
      "stream",
    );
    const html = await readStream(rendered.body);

    expect(html).toContain("Loading portal content");
    expect(html).toContain("Resolved portal content");
  });

  it("throws when an SSR target selector does not match the rendered tree", () => {
    expect(() =>
      renderToServer(
        () => {
          Portal({ mount: "#missing-target", children: $txt("Orphaned content") });
          return $tmpl("main") as unknown as JSX.Element;
        },
        "sync",
      ),
    ).toThrow('[vynn]: SSR Portal target "#missing-target" was not found');
  });

  it("accepts a direct SSR element reference as its target", () => {
    const rendered = renderToServer(() => {
      const root = $tmpl("div");
      const outlet = $tmpl("aside");
      $attr(outlet, "id", "portal-root");

      const portal = Portal({
        mount: outlet,
        children: $txt("Direct target content"),
      });

      $insert(root, () => [portal, outlet] as unknown as JSX.Element);
      return root as unknown as JSX.Element;
    }, "sync");

    expect(rendered.body).toBe(
      '<div><aside id="portal-root">Direct target content</aside></div>',
    );
  });
  it("patches an external portal target when the Portal is created after an async boundary resolves", async () => {
    const rendered = renderToServer(() => {
      const root = $tmpl("div");
      const outlet = $tmpl("aside");
      $attr(outlet, "id", "portal-root");

      const boundary = createSSRAsync(
        () => [createSSRText("Loading page")],
        () =>
          [
            Portal({
              mount: "#portal-root",
              children: $txt("Resolved portal content"),
            }),
          ] as unknown as JSX.Element[],
        [Promise.resolve()],
      );

      $insert(root, () => [boundary, outlet] as unknown as JSX.Element);
      return root as unknown as JSX.Element;
    }, "stream");

    const html = await readStream(rendered.body);

    expect(html).toContain("Loading page");
    expect(html).toContain("Resolved portal content");
    expect(html).toContain('document.querySelector(s)');
    expect(html).toContain("vynn-portal-0");
  });

  it("includes portal targets created within the resolved async branch in its normal boundary patch", async () => {
    const rendered = renderToServer(() => {
      const root = $tmpl("div");

      const boundary = createSSRAsync(
        () => [createSSRText("Loading page")],
        () => {
          const outlet = $tmpl("aside");
          $attr(outlet, "id", "local-portal-root");
          const portal = Portal({
            mount: "#local-portal-root",
            children: $txt("Local resolved portal content"),
          });

          return [outlet, portal] as unknown as JSX.Element[];
        },
        [Promise.resolve()],
      );

      $insert(root, () => boundary as unknown as JSX.Element);
      return root as unknown as JSX.Element;
    }, "stream");

    const html = await readStream(rendered.body);

    expect(html).toContain("Loading page");
    expect(html).toContain('<aside id="local-portal-root">Local resolved portal content</aside>');
    expect(html).not.toContain("vynn-portal-0");
  });

  it("supports late portal registration in async string rendering", async () => {
    const rendered = await renderToServer(() => {
      const root = $tmpl("div");
      const outlet = $tmpl("aside");
      $attr(outlet, "id", "portal-root");

      const boundary = createSSRAsync(
        () => [createSSRText("Loading page")],
        () =>
          [
            Portal({
              mount: "#portal-root",
              children: $txt("Async-mode portal content"),
            }),
          ] as unknown as JSX.Element[],
        [Promise.resolve()],
      );

      $insert(root, () => [boundary, outlet] as unknown as JSX.Element);
      return root as unknown as JSX.Element;
    }, "async");

    expect(rendered.body).toContain("Async-mode portal content");
    expect(rendered.body).toContain("vynn-portal-0");
  });
  it("retries a resolved async child when its portal target is appended afterward", async () => {
    const rendered = renderToServer(() => {
      const root = $tmpl("div");
      const outlet = $tmpl("aside");
      $attr(outlet, "id", "portal-root");

      const boundary = createSSRAsync(
        () => [createSSRText("Loading page")],
        () => {
          const nestedBoundary = createSSRAsync(
            () => [createSSRText("Loading portal child")],
            () => [createSSRText("Resolved portal child")],
            [Promise.resolve()],
          );

          return [
            Portal({
              mount: "#portal-root",
              children: nestedBoundary as unknown as JSX.Element,
            }),
          ] as unknown as JSX.Element[];
        },
        [Promise.resolve()],
      );

      $insert(root, () => [boundary, outlet] as unknown as JSX.Element);
      return root as unknown as JSX.Element;
    }, "stream");

    const html = await readStream(rendered.body);

    expect(html).toContain("Loading portal child");
    expect(html).toContain("Resolved portal child");
    expect(html).toContain("t.append(p.content)");
    expect(html).toContain("f(null)");
  });
  it("keeps a Portal rendered by an Await children getter after $async resolves", async () => {
    const rendered = renderToServer(() => {
      const root = $tmpl("div");
      const outlet = $tmpl("aside");
      $attr(outlet, "id", "portal-root");

      const data = $async(async () => "Resolved $async value");
      const boundary = Await({
        fallback: "Loading async value",
        get children() {
          const value = data.value;

          return Portal({
            mount: "#portal-root",
            children: $txt(value),
          });
        },
      });

      $insert(root, () => [boundary, outlet] as unknown as JSX.Element);
      return root as unknown as JSX.Element;
    }, "stream");

    const html = await readStream(rendered.body);

    expect(html).toContain("Loading async value");
    expect(html).toContain("Resolved $async value");
    expect(html).toContain("vynn-portal-0");
    expect(html).toContain("f(null)");
  });

});