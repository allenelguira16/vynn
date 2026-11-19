// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { $attr } from "../src/render/$attr";
import { $child, $sibling, $template } from "../src/render/$template";
import { $cmpnt, isRootNode } from "../src/render/$cmpnt";
import { $registerHead } from "../src/render/head-runtime";
import { $insert } from "../src/render/$insert";
import { $state } from "../src/reactivity/state";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function DocumentApp(): JSX.Element {
  const html = $template("<html></html>")();

  $insert(html, () => {
    const head = $template("<head></head>")();

    $insert(head, () => {
      const meta = $template("<meta></meta>")();
      $attr(meta, "name", "description");
      $attr(meta, "content", "Application description");
      return meta as unknown as JSX.Element;
    });

    const body = $template("<body></body>")();

    $insert(body, () => {
      const main = $template("<main></main>")();

      $insert(main, () => {
        const paragraph = $template("<p></p>")();
        $insert(paragraph, "Server content");
        return paragraph as unknown as JSX.Element;
      });

      return main as unknown as JSX.Element;
    });

    return [head, body] as unknown as JSX.Element;
  });

  return html as unknown as JSX.Element;
}

const DOCUMENT_TEMPLATE =
  '<html lang="en"><head><title></title></head><body><main><!--$v0--></main></body></html>';

function SingleTemplateDocumentApp(): JSX.Element {
  const html = $template(DOCUMENT_TEMPLATE)();
  const head = $child(html);
  const title = $child(head);
  const body = $sibling(head);
  const main = $child(body);

  $insert(title, ["Vynn ", "Client title"] as unknown as JSX.Element);
  $insert(main, "Client body", "0");

  return html as unknown as JSX.Element;
}

function StaticTemplateDocumentApp(): JSX.Element {
  return $template(
    '<html lang="en"><head><meta charset="utf-8"><title>Document title</title><meta name="description" content="Document description"></head><body><main>Document body</main></body></html>',
  )() as unknown as JSX.Element;
}

function RegisteredHeadDocumentApp(): JSX.Element {
  $registerHead("meta", {
    name: "description",
    content: "Application description",
  });

  const html = $template("<html></html>")();
  const head = $template("<head></head>")();
  const body = $template("<body></body>")();

  $insert(body, "Registered document body");
  $insert(html, [head, body] as unknown as JSX.Element);

  return html as unknown as JSX.Element;
}

describe("document-root rendering", () => {
  it("hydrates metadata and body bindings from a single document template", () => {
    // The Vite document adapter injects charset metadata before the
    // authored title. Template navigation must ignore this extra head node.
    document.head.innerHTML =
      '<meta charset="UTF-8" key="meta:charset"><title>Vynn Server title</title>';
    document.body.innerHTML = "<main>Server body<!--$v0--></main>";

    const serverRoot = document.documentElement;
    const serverTitle = document.head.querySelector("title");
    const serverMain = document.querySelector("main");

    const unmount = hydrateToDOM(SingleTemplateDocumentApp, document);

    expect(document.documentElement).toBe(serverRoot);
    expect(document.head.querySelectorAll("meta[charset]")).toHaveLength(1);
    expect(document.head.querySelector("title")).toBe(serverTitle);
    expect(document.title).toBe("Vynn Client title");
    expect(document.title).not.toContain("$v");
    expect(document.querySelector("main")).toBe(serverMain);
    expect(document.querySelector("main")?.textContent).toBe("Client body");

    unmount();
  });

  it("updates a reactive title as one text node without comment markers", () => {
    const counter = $state(0);
    const App = (): JSX.Element => {
      const html = $template(
        '<html lang="en"><head><title></title></head><body></body></html>',
      )();
      const title = $child($child(html));

      $insert(
        title,
        () => ["Vynn SSR Sandbox ", counter.value] as unknown as JSX.Element,
      );

      return html as unknown as JSX.Element;
    };

    const unmount = renderToDOM($cmpnt(App), document);

    expect(document.title).toBe("Vynn SSR Sandbox 0");
    counter.value++;
    expect(document.title).toBe("Vynn SSR Sandbox 1");
    expect(document.title).not.toContain("$v");

    unmount();
  });

  it("hydrates the complete Document and ignores plugin-injected resources", () => {
    document.head.innerHTML = [
      "<!--vynn:internal:start-->",
      '<link rel="stylesheet" href="/assets/app.css">',
      "<!--vynn:internal:end-->",
      '<meta name="description" content="Application description">',
    ].join("");
    document.body.innerHTML = [
      "<main><p>Server content</p></main>",
      "<!--vynn:internal:start-->",
      '<script type="module" src="/assets/client.js"></script>',
      "<!--vynn:internal:end-->",
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
    expect(document.documentElement.innerHTML).not.toContain("vynn:internal");
    expect(document.documentElement.innerHTML).not.toContain("_$int");

    unmount();
  });

  it("restores static shell metadata when a document app is unmounted", () => {
    document.head.innerHTML = '<meta name="description" content="Shell description">';
    const previousRoot = document.documentElement;
    const shellDescription = document.head.querySelector('meta[name="description"]');

    const unmount = renderToDOM($cmpnt(RegisteredHeadDocumentApp), document);

    expect(document.documentElement).not.toBe(previousRoot);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Application description",
    );
    expect(shellDescription?.isConnected).toBe(false);

    unmount();

    expect(document.documentElement).toBe(previousRoot);
    expect(document.head.querySelector('meta[name="description"]')).toBe(shellDescription);
    expect(shellDescription?.getAttribute("content")).toBe("Shell description");
  });

  it("mounts one document template without duplicating shell metadata", () => {
    document.head.innerHTML = [
      '<meta charset="UTF-8">',
      "<title>Shell title</title>",
      '<meta name="description" content="Shell description">',
      '<link rel="stylesheet" href="/assets/app.css">',
    ].join("");
    document.body.innerHTML = '<script type="module" src="/assets/client.js"></script>';

    const previousRoot = document.documentElement;
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    const clientEntry = document.querySelector('script[src="/assets/client.js"]');

    const unmount = renderToDOM($cmpnt(StaticTemplateDocumentApp), document);

    expect(document.documentElement).not.toBe(previousRoot);
    expect(document.head.querySelectorAll("meta[charset]")).toHaveLength(1);
    expect(document.head.querySelector("title")?.textContent).toBe("Document title");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Document description",
    );
    expect(document.querySelector('link[rel="stylesheet"]')).toBe(stylesheet);
    expect(document.querySelector('script[src="/assets/client.js"]')).toBe(clientEntry);
    expect(document.querySelector("main")?.textContent).toBe("Document body");

    unmount();

    expect(document.documentElement).toBe(previousRoot);
    expect(document.head.querySelector("title")?.textContent).toBe("Shell title");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Shell description",
    );
  });

  it("replaces the client-only shell while preserving its resources", () => {
    document.head.innerHTML = [
      '<meta charset="UTF-8" key="meta:charset">',
      '<link rel="stylesheet" href="/assets/app.css">',
      '<script type="module" src="/@vite/client"></script>',
    ].join("");
    document.body.innerHTML = '<script type="module" src="/assets/client.js"></script>';

    const previousHtml = document.documentElement;
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    const viteClient = document.querySelector('script[src="/@vite/client"]');
    const clientEntry = document.querySelector('script[src="/assets/client.js"]');

    const unmount = renderToDOM($cmpnt(DocumentApp), document);

    expect(document.documentElement).not.toBe(previousHtml);
    expect(document.querySelector('link[rel="stylesheet"]')).toBe(stylesheet);
    expect(document.querySelector('script[src="/@vite/client"]')).toBe(viteClient);
    expect(document.querySelector('script[src="/assets/client.js"]')).toBe(clientEntry);
    expect(document.querySelector("main")?.textContent).toBe("Server content");

    const rootMarker = document.body.lastChild;
    expect(rootMarker).toBeInstanceOf(Text);
    expect(rootMarker && isRootNode(rootMarker)).toBe(true);
    expect(rootMarker?.parentNode).toBe(document.body);

    expect(document.documentElement.innerHTML).not.toContain("vynn:internal");
    expect(document.documentElement.innerHTML).not.toContain("_$int");

    unmount();
  });
});
