// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { $state } from "../src/reactivity/$state";
import { $attr } from "../src/render/$attr";
import { $insert } from "../src/render/$insert";
import { $tmpl } from "../src/render/$tmpl";
import { $txt } from "../src/render/$txt";
import { renderToServer } from "../src/server/render-to-server";

const parsedCode =
  '<pre><code class="language-ts">const value = 1 &amp; 2;</code></pre>';

function RawHtmlApp(): JSX.Element {
  const main = $tmpl("main");

  $insert(main, () => {
    const content = $tmpl("div");
    $attr(content, "className", "not-prose multiline-mockup-code");
    $attr(content, "html", parsedCode);
    return content as unknown as JSX.Element;
  });

  $insert(main, () => {
    const paragraph = $tmpl("p");
    $insert(paragraph, $txt("After raw HTML"));
    return paragraph as unknown as JSX.Element;
  });

  return main as unknown as JSX.Element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("raw HTML content", () => {
  it("renders HTML without escaping it during synchronous SSR", () => {
    const rendered = renderToServer(RawHtmlApp, "sync");

    expect(rendered.body).toContain(
      '<div class="not-prose multiline-mockup-code" data-vynn-raw-html="">' + parsedCode + "</div>",
    );
    expect(rendered.body).not.toContain('html="');
    expect(rendered.body).toContain("<p>After raw HTML</p>");
  });

  it("renders raw HTML during async and streaming SSR", async () => {
    const asyncResult = await renderToServer(RawHtmlApp, "async");
    expect(asyncResult.body).toContain('data-vynn-raw-html="">' + parsedCode + "</div>");

    const streamResult = renderToServer(RawHtmlApp, "stream");
    const reader = streamResult.body.getReader();
    const decoder = new TextDecoder();
    let streamedHTML = "";

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      streamedHTML += decoder.decode(chunk.value);
    }

    expect(streamedHTML).toContain('data-vynn-raw-html="">' + parsedCode + "</div>");
  });

  it("updates raw HTML reactively on the client", () => {
    const host = document.createElement("div");
    const html = $state("<strong>Initial</strong>");
    let element!: Element;

    const unmount = renderToDOM(() => {
      element = $tmpl("div");
      $attr(element, "html", () => html.value);
      return element as unknown as JSX.Element;
    }, host);

    expect(element.innerHTML).toBe("<strong>Initial</strong>");

    html.value = "<em>Updated</em>";
    expect(element.innerHTML).toBe("<em>Updated</em>");

    unmount();
  });

  it("keeps raw HTML descendants out of the hydration claim queue", () => {
    const rendered = renderToServer(RawHtmlApp, "sync");
    const host = document.createElement("div");
    host.innerHTML = rendered.body;

    const serverContent = host.querySelector(".multiline-mockup-code");
    const serverPre = host.querySelector("pre");
    const serverParagraph = host.querySelector("p");
    const serverText = serverParagraph?.firstChild;

    const unmount = hydrateToDOM(RawHtmlApp, host);

    expect(host.querySelector(".multiline-mockup-code")).toBe(serverContent);
    expect(host.querySelector("pre")).toBe(serverPre);
    expect(host.querySelector("p")).toBe(serverParagraph);
    expect(host.querySelector("p")?.firstChild).toBe(serverText);
    expect(serverContent?.hasAttribute("data-vynn-raw-html")).toBe(false);
    expect(host.innerHTML).not.toContain("data-vynn-raw-html");

    unmount();
  });

  it("rejects combining raw HTML with Vynn-managed children during SSR", () => {
    expect(() =>
      renderToServer(() => {
        const element = $tmpl("div");
        $attr(element, "html", "<strong>Raw</strong>");
        $insert(element, $txt("Managed child"));
        return element as unknown as JSX.Element;
      }, "sync"),
    ).toThrow("An element cannot have both the `html` prop and children.");
  });
});
