// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { renderHeadPatchRuntime } from "../src/server/head";

declare global {
  interface Window {
    $AHP?: (html: string) => void;
  }
}

afterEach(() => {
  document.head.innerHTML = "";
  delete window.$AHP;
});

function installHeadPatchRuntime(): (html: string) => void {
  const source = renderHeadPatchRuntime();
  new Function("window", "document", source)(window, document);
  if (!window.$AHP) throw new Error("The SSR head patch runtime was not installed.");
  return window.$AHP;
}

describe("streamed SSR head patches", () => {
  it("replaces a title in its original position without moving following metadata", () => {
    document.head.innerHTML = [
      '<meta charset="UTF-8" key="meta:charset">',
      "<title>Vynn documentation</title>",
      '<link rel="icon" href="/vynn-logo.webp">',
      '<meta name="description" content="Documentation">',
      '<meta property="og:title" content="Vynn documentation">',
    ].join("");

    installHeadPatchRuntime()('<title key="title">Quick start | Vynn</title>');

    const children = Array.from(document.head.children).filter(
      (element) => element.localName !== "template",
    );
    expect(children.map((element) => element.localName)).toEqual([
      "meta",
      "title",
      "link",
      "meta",
      "meta",
    ]);
    expect(document.head.querySelector("title")?.textContent).toBe("Quick start | Vynn");
    expect(document.head.querySelector('link[rel="icon"]')).not.toBeNull();
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Documentation",
    );
    expect(document.head.querySelector("template[data-vynn-head-fallback")?.innerHTML).toBe(
      "<title>Vynn documentation</title>",
    );
  });

  it("replaces a previous keyed title and removes stale keyed metadata", () => {
    document.head.innerHTML = [
      '<meta charset="UTF-8" key="meta:charset">',
      '<title key="title">First route</title>',
      '<meta name="description" content="Old route" key="meta:name:description">',
      '<link rel="icon" href="/vynn-logo.webp">',
    ].join("");

    installHeadPatchRuntime()([
      '<title key="title">Second route</title>',
      '<link rel="icon" href="/vynn-logo.webp" key="link:icon:/vynn-logo.webp">',
    ].join(""));

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")?.textContent).toBe("Second route");
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
    expect(document.head.querySelector('link[rel="icon"]')).not.toBeNull();
  });

  it("replaces an Open Graph collection at its original position", () => {
    document.head.innerHTML = [
      '<meta charset="UTF-8" key="meta:charset">',
      '<meta property="og:title" content="Page">',
      '<meta property="og:image" content="/old-large.jpg">',
      '<meta property="og:image:width" content="1200">',
      '<link rel="icon" href="/vynn-logo.webp">',
    ].join("");

    installHeadPatchRuntime()([
      '<meta property="og:image" content="/new-large.jpg" key="head:1" data-vynn-head-replace="meta:property:og:image">',
      '<meta property="og:image:width" content="1600" key="head:2">',
    ].join(""));

    const metas = Array.from(document.head.querySelectorAll("meta[property]"));
    expect(metas.map((element) => element.getAttribute("property"))).toEqual([
      "og:title",
      "og:image",
      "og:image:width",
    ]);
    expect(metas[1]?.getAttribute("content")).toBe("/new-large.jpg");
    expect(metas[2]?.getAttribute("content")).toBe("1600");
    expect(metas[1]?.hasAttribute("data-vynn-head-replace")).toBe(false);
  });
});
