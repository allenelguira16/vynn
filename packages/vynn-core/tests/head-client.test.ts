// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { withHydration } from "../src/client/hydration";
import { initializeHeadContext } from "../src/context/head-context";
import { $state } from "../src/reactivity/state";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $registerHead, $registerHeadGroup } from "../src/render/head-runtime";
import { $template } from "../src/render/$template";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("client head rendering", () => {
  it("restores the previous registration when a nested owner is disposed", () => {
    const root = createOwner();

    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("title", { children: "Layout" });

      const page = createOwner(root);
      runWithOwner(page, () => {
        $registerHead("title", { children: "Page" });
      });

      const activeTitle = document.head.querySelector("title");
      expect(document.head.querySelectorAll("title")).toHaveLength(1);
      expect(activeTitle?.textContent).toBe("Page");

      disposeOwner(page);

      expect(document.head.querySelectorAll("title")).toHaveLength(1);
      expect(document.head.querySelector("title")).toBe(activeTitle);
      expect(document.head.querySelector("title")?.textContent).toBe("Layout");
    });

    disposeOwner(root);
    expect(document.head.querySelector("title")).toBeNull();
  });

  it("adopts the server-managed title during client-only rendering", () => {
    document.head.innerHTML = '<title key="title">Vynn App</title>';
    const shellTitle = document.head.querySelector("title");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("title", { children: "Client page" });
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")).toBe(shellTitle);
    expect(document.head.querySelector("title")?.textContent).toBe("Client page");

    disposeOwner(root);
  });

  it("preserves and restores an unmarked title from the authored HTML document", () => {
    document.head.innerHTML = "<title>HTML template title</title>";
    const templateTitle = document.head.querySelector("title");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("title", { children: "Application title" });
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")).not.toBe(templateTitle);
    expect(document.head.querySelector("title")?.textContent).toBe("Application title");
    expect(templateTitle?.isConnected).toBe(false);

    disposeOwner(root);

    expect(document.head.querySelector("title")).toBe(templateTitle);
    expect(templateTitle?.textContent).toBe("HTML template title");
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
      $registerHead("meta", { name: "description", content: "Application description" });
    });

    expect(document.head.querySelector('meta[name="viewport"]')).toBe(viewport);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Application description",
    );
    expect(description?.isConnected).toBe(false);

    disposeOwner(root);

    expect(document.head.querySelector('meta[name="description"]')).toBe(description);
    expect(description?.getAttribute("content")).toBe("HTML template description");
  });

  it("does not reuse an existing managed element with a different identity", () => {
    document.head.innerHTML =
      '<meta name="description" key="meta:name:description" content="Existing">';
    const description = document.head.querySelector("meta");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("meta", { property: "og:title", content: "Application title" });
    });

    expect(document.head.querySelector('meta[name="description"]')).toBe(description);
    expect(document.head.querySelector('meta[property="og:title"]')).not.toBe(description);
    expect(description?.isConnected).toBe(true);

    disposeOwner(root);
  });

  it("prefers the SSR-managed node and removes a duplicate static title", () => {
    document.head.innerHTML = [
      "<title>HTML template title</title>",
      '<title key="title">SSR title</title>',
    ].join("");
    const managedTitle = document.head.querySelector('title[key="title"]');

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("title", { children: "Client title" });
    });

    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("title")).toBe(managedTitle);
    expect(managedTitle?.textContent).toBe("Client title");

    disposeOwner(root);
  });

  it("does not consume unkeyed shell metadata while hydrating body nodes", () => {
    document.documentElement.innerHTML = [
      "<head>",
      "<title>Server title</title>",
      '<meta name="description" content="Shell description">',
      "</head>",
      "<body><p>Application text</p></body>",
    ].join("");
    const serverTitle = document.head.querySelector("title");
    const serverMeta = document.head.querySelector('meta[name="description"]');
    const serverText = document.querySelector("p")?.firstChild;

    const root = createOwner();
    let hydratedText!: Text;

    runWithOwner(root, () => {
      withHydration(() => {
        initializeHeadContext();
        const html = $template(
          '<html><head><title>Server title</title><meta name="description" content="Shell description"></head><body><p>Application text</p></body></html>',
        )();
        hydratedText = html.querySelector("p")?.firstChild as Text;
        $registerHead("title", { children: "Client title" });
      }, document);
    });

    expect(document.head.querySelector("title")).not.toBe(serverTitle);
    expect(document.head.querySelector("title")?.textContent).toBe("Client title");
    expect(serverTitle?.isConnected).toBe(false);
    expect(document.head.querySelector('meta[name="description"]')).toBe(serverMeta);
    expect(hydratedText).toBe(serverText);

    disposeOwner(root);
  });

  it("appends bare Open Graph image declarations to the shell collection", () => {
    document.head.innerHTML = [
      '<meta property="og:image" content="/default-1.jpg">',
      '<meta property="og:image" content="/default-2.jpg">',
    ].join("");
    const defaults = [...document.head.querySelectorAll('meta[property="og:image"]')];

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("meta", { property: "og:image", content: "/additional.jpg" });
    });

    expect(
      [...document.head.querySelectorAll('meta[property="og:image"]')].map((element) =>
        element.getAttribute("content"),
      ),
    ).toEqual(["/default-1.jpg", "/default-2.jpg", "/additional.jpg"]);

    disposeOwner(root);

    expect([...document.head.querySelectorAll('meta[property="og:image"]')]).toEqual(defaults);
  });

  it("replaces a shell Open Graph image collection as a group and restores it", () => {
    document.head.innerHTML = [
      '<meta property="og:image" content="/default-1.jpg">',
      '<meta property="og:image" content="/default-2.jpg">',
    ].join("");
    const defaults = [...document.head.querySelectorAll('meta[property="og:image"]')];

    const root = createOwner();
    const page = createOwner(root);
    runWithOwner(root, initializeHeadContext);

    runWithOwner(page, () => {
      $registerHeadGroup(() => [
        $registerHead("meta", { property: "og:image", content: "/page-1.jpg" }),
        $registerHead("meta", { property: "og:image", content: "/page-2.jpg" }),
      ]);
    });

    const activeImages = [...document.head.querySelectorAll('meta[property="og:image"]')];
    expect(activeImages.map((element) => element.getAttribute("content"))).toEqual([
      "/page-1.jpg",
      "/page-2.jpg",
    ]);
    expect(defaults.every((element) => !element.isConnected)).toBe(true);

    disposeOwner(page);

    const restoredImages = [...document.head.querySelectorAll('meta[property="og:image"]')];
    expect(restoredImages).toEqual(defaults);
    expect(restoredImages.map((element) => element.getAttribute("content"))).toEqual([
      "/default-1.jpg",
      "/default-2.jpg",
    ]);

    disposeOwner(root);
  });

  it("restores static metadata retained in the SSR fallback template", () => {
    document.head.innerHTML = [
      '<template data-vynn-head-fallback>',
      '<meta property="og:image" content="/shell-large.jpg">',
      '<meta property="og:image" content="/shell-square.jpg">',
      "</template>",
    ].join("");
    const fallback = document.head.querySelector("template") as HTMLTemplateElement;
    const defaults = [...fallback.content.querySelectorAll('meta[property="og:image"]')];

    const root = createOwner();
    const page = createOwner(root);
    runWithOwner(root, initializeHeadContext);

    runWithOwner(page, () => {
      $registerHeadGroup(() => [
        $registerHead("meta", { property: "og:image", content: "/page.jpg" }),
      ]);
    });

    expect(document.head.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "/page.jpg",
    );
    expect(fallback.isConnected).toBe(true);

    disposeOwner(page);

    expect(document.head.querySelectorAll('meta[property="og:image"]')).toHaveLength(2);
    expect([...document.head.querySelectorAll('meta[property="og:image"]')]).toEqual(defaults);
    expect(defaults.map((element) => element.getAttribute("content"))).toEqual([
      "/shell-large.jpg",
      "/shell-square.jpg",
    ]);
    expect(fallback.isConnected).toBe(false);

    disposeOwner(root);
  });

  it("does not adopt an unkeyed stylesheet from the generated client shell", () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/app.css">';
    const shellStylesheet = document.head.querySelector("link");

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("link", { rel: "stylesheet", href: "/assets/app.css" });

      expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(2);
    });

    disposeOwner(root);

    expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
    expect(document.head.querySelector("link")).toBe(shellStylesheet);
  });

  it("does not adopt metadata inside an internal resource range", () => {
    document.head.innerHTML =
      '<!--vynn:internal:start--><meta name="description" content="Injected resource"><!--vynn:internal:end-->';
    const injectedMeta = document.head.querySelector('meta[name="description"]');

    const root = createOwner();
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("meta", { name: "description", content: "Application description" });
    });

    expect(injectedMeta?.getAttribute("content")).toBe("Injected resource");
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(2);

    disposeOwner(root);
  });

  it("keeps the active node when a reactive metadata identity changes", () => {
    const root = createOwner();
    const name = $state("description");
    const content = $state("Initial");
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("meta", {
        get name() {
          return name.value;
        },
        get content() {
          return content.value;
        },
      });
    });

    const original = document.head.querySelector('meta[name="description"]');
    name.value = "robots";

    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(0);
    expect(document.head.querySelector('meta[name="robots"]')).toBe(original);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "Initial",
    );

    content.value = "Updated";
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "Updated",
    );

    disposeOwner(root);
  });

  it("updates a registered title when a reactive getter changes", () => {
    const root = createOwner();
    const currentTitle = $state("Initial");
    runWithOwner(root, () => {
      initializeHeadContext();
      $registerHead("title", {
        get children() {
          return currentTitle.value;
        },
      });
    });

    expect(document.head.querySelector("title")?.textContent).toBe("Initial");
    currentTitle.value = "Updated";
    expect(document.head.querySelector("title")?.textContent).toBe("Updated");

    disposeOwner(root);
  });
});
