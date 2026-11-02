// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { $attr } from "../src/render/$attr";
import { $insert } from "../src/render/$insert";
import { $tmpl } from "../src/render/$tmpl";
import { $txt } from "../src/render/$txt";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function DocumentApp(): JSX.Element {
  const html = $tmpl("html");

  $insert(html, () => {
    const head = $tmpl("head");

    $insert(head, () => {
      const meta = $tmpl("meta");
      $attr(meta, "name", "description");
      $attr(meta, "content", "Application description");
      return meta as unknown as JSX.Element;
    });

    const body = $tmpl("body");

    $insert(body, () => {
      const main = $tmpl("main");

      $insert(main, () => {
        const paragraph = $tmpl("p");
        $insert(paragraph, $txt("Server content"));
        return paragraph as unknown as JSX.Element;
      });

      return main as unknown as JSX.Element;
    });

    return [head, body] as unknown as JSX.Element;
  });

  return html as unknown as JSX.Element;
}

describe("document-root rendering", () => {
  it("hydrates the complete Document and ignores plugin-injected resources", () => {
    document.head.innerHTML = [
      '<link rel="stylesheet" _$int href="/assets/app.css">',
      '<meta name="description" content="Application description">',
    ].join("");
    document.body.innerHTML = [
      "<main><p>Server content</p></main>",
      '<script type="module" _$int src="/assets/client.js"></script>',
    ].join("");

    const serverHtml = document.documentElement;
    const serverHead = document.head;
    const serverMeta = document.head.querySelector('meta[name="description"]');
    const serverMain = document.querySelector("main");
    const serverParagraph = document.querySelector("p");
    const serverText = serverParagraph?.firstChild;
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    const clientEntry = document.querySelector('script[src="/assets/client.js"]');

    const unmount = hydrateToDOM(DocumentApp, document);

    expect(document.documentElement).toBe(serverHtml);
    expect(document.head).toBe(serverHead);
    expect(document.head.querySelector('meta[name="description"]')).toBe(serverMeta);
    expect(document.querySelector("main")).toBe(serverMain);
    expect(document.querySelector("p")).toBe(serverParagraph);
    expect(document.querySelector("p")?.firstChild).toBe(serverText);
    expect(document.querySelector('link[rel="stylesheet"]')).toBe(stylesheet);
    expect(document.querySelector('script[src="/assets/client.js"]')).toBe(clientEntry);

    unmount();
  });

  it("replaces the client-only shell while preserving its resources", () => {
    document.head.innerHTML = [
      '<meta charset="UTF-8" key="meta:charset">',
      '<link rel="stylesheet" _$int href="/assets/app.css">',
      '<script type="module" _$int src="/@vite/client"></script>',
    ].join("");
    document.body.innerHTML =
      '<script type="module" _$int src="/assets/client.js"></script>';

    const previousHtml = document.documentElement;
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    const viteClient = document.querySelector('script[src="/@vite/client"]');
    const clientEntry = document.querySelector('script[src="/assets/client.js"]');

    const unmount = renderToDOM(DocumentApp, document);

    expect(document.documentElement).not.toBe(previousHtml);
    expect(document.querySelector('link[rel="stylesheet"]')).toBe(stylesheet);
    expect(document.querySelector('script[src="/@vite/client"]')).toBe(viteClient);
    expect(document.querySelector('script[src="/assets/client.js"]')).toBe(clientEntry);
    expect(document.querySelector("main")?.textContent).toBe("Server content");

    unmount();
  });
});
