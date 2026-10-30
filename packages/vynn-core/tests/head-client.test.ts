// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import { $head, $headTmpl } from "../src/render/$head";
import { initializeHeadContext } from "../src/context/head-context";
import { $insert } from "../src/render/$insert";
import { $txt } from "../src/render/$txt";
import { withHydration } from "../src/client/hydration";

afterEach(() => {
  document.head.innerHTML = "";
});

describe("client head rendering", () => {
  it("restores the previous registration when a nested owner is disposed", () => {
    const root = createOwner();
    let rootTitle!: HTMLTitleElement;

    runWithOwner(root, () => {
      initializeHeadContext();

      rootTitle = $headTmpl("title");
      rootTitle.textContent = "Layout";
      $head(rootTitle);

      const page = createOwner(root);
      runWithOwner(page, () => {
        const pageTitle = $headTmpl("title");
        pageTitle.textContent = "Page";
        $head(pageTitle);
      });

      expect(document.head.querySelector("title")?.textContent).toBe("Page");

      disposeOwner(page);

      expect(document.head.querySelector("title")).toBe(rootTitle);
      expect(document.head.querySelector("title")?.textContent).toBe("Layout");
    });

    disposeOwner(root);
    expect(document.head.querySelector("title")).toBeNull();
  });

  it("reuses the generated shell title during client-only rendering", () => {
    document.head.innerHTML =
      '<title data-vynn-head="title">Vynn App</title>';
    const shellTitle = document.head.querySelector("title");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();

      const title = $headTmpl("title", "title");
      expect(title).toBe(shellTitle);

      title.textContent = "Client page";
      $head(title);
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")?.textContent).toBe("Client page");

    disposeOwner(root);
  });

  it("adopts an unmarked title from the HTML document", () => {
    document.head.innerHTML = "<title>HTML template title</title>";
    const templateTitle = document.head.querySelector("title");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();

      const title = $headTmpl("title", "title");
      expect(title).toBe(templateTitle);

      title.textContent = "Application title";
      $head(title);
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")?.textContent).toBe(
      "Application title",
    );
    expect(document.head.querySelector("title")?.getAttribute("data-vynn-head"))
      .toBe("title");

    disposeOwner(root);
  });

  it("matches unmarked metadata by identity without reusing unrelated tags", () => {
    document.head.innerHTML = [
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="description" content="HTML template description">',
    ].join("");
    const viewport = document.head.querySelector('meta[name="viewport"]');
    const description = document.head.querySelector('meta[name="description"]');

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();

      const meta = $headTmpl("meta", "meta:name:description");
      expect(meta).toBe(description);

      meta.setAttribute("content", "Application description");
      $head(meta);
    });

    expect(document.head.querySelector('meta[name="viewport"]')).toBe(viewport);
    expect(document.head.querySelectorAll('meta[name="description"]'))
      .toHaveLength(1);
    expect(description?.getAttribute("content")).toBe("Application description");

    disposeOwner(root);
  });

  it("does not reuse a managed element with a different identity", () => {
    document.head.innerHTML =
      '<meta name="description" data-vynn-head="meta:name:description" content="Existing">';
    const description = document.head.querySelector("meta");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();

      const meta = $headTmpl("meta", "meta:property:og:title");
      expect(meta).not.toBe(description);
      expect(description?.isConnected).toBe(true);
      $head(meta);
    });

    disposeOwner(root);
  });

  it("prefers the SSR-managed node and removes a duplicate static title", () => {
    document.head.innerHTML = [
      "<title>HTML template title</title>",
      '<title data-vynn-head="title">SSR title</title>',
    ].join("");
    const managedTitle = document.head.querySelector(
      'title[data-vynn-head="title"]',
    );

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();

      const title = $headTmpl("title", "title");
      expect(title).toBe(managedTitle);
      $head(title);
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")).toBe(managedTitle);

    disposeOwner(root);
  });

  it("does not consume application text nodes while hydrating title children", () => {
    document.head.innerHTML =
      '<title data-vynn-head="title">Server title</title>';
    const appRoot = document.createElement("div");
    appRoot.innerHTML = "<p>Application text</p>";
    const serverText = appRoot.querySelector("p")?.firstChild;

    const root = createOwner();
    let hydratedText!: Text;

    runWithOwner(root, () => {
      withHydration(() => {
        initializeHeadContext();

        const title = $headTmpl("title", "title");
        $insert(title, $txt("Client title"));
        $head(title);

        hydratedText = $txt("Application text") as Text;
      }, appRoot);
    });

    expect(hydratedText).toBe(serverText);
    expect(document.head.querySelector("title")?.textContent).toBe("Client title");
    expect(appRoot.textContent).toBe("Application text");

    disposeOwner(root);
  });

  it("preserves sibling text across separate head child insertions", () => {
    const root = createOwner();

    runWithOwner(root, () => {
      initializeHeadContext();

      const title = $headTmpl("title", "title");
      $insert(title, $txt("Vynn SSR Sandbox "));
      $insert(title, $txt("0"));
      $head(title);

      expect(title.textContent).toBe("Vynn SSR Sandbox 0");
    });

    disposeOwner(root);
  });

  it("adopts an SSR-rendered head element during hydration", () => {
    document.head.innerHTML =
      '<title data-vynn-head="title">Server title</title>';
    const serverTitle = document.head.querySelector("title");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();

      const title = $headTmpl("title", "title");
      expect(title).toBe(serverTitle);

      title.textContent = "Client title";
      $head(title);
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")?.textContent).toBe("Client title");

    disposeOwner(root);
  });
});
