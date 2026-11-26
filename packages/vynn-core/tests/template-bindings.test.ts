// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { withHydration } from "../src/client/hydration";
import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { initializeHeadContext } from "../src/context/head-context";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $attr } from "../src/render/$attr";
import { $insert } from "../src/render/$insert";
import { $child, $finishTemplate, $sibling, $staticTemplate, $template } from "../src/render/$template";
import { SVG_NAMESPACE, withDOMNamespace } from "../src/render/namespace";
import { $state } from "../src/reactivity/state";
import { renderToServer } from "../src/server/render-to-server";
import type { JSX } from "../src/types/jsx";

function createTestOwner() {
  const owner = createOwner();
  runWithOwner(owner, initializeHeadContext);
  return owner;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("$staticTemplate", () => {
  it("clones static markup into independent DOM trees", () => {
    const factory = $staticTemplate("<section><h1>Static heading</h1><p>Static content</p></section>");
    const first = factory();
    const second = factory();

    expect(first).not.toBe(second);
    expect(first.innerHTML).toBe("<h1>Static heading</h1><p>Static content</p>");
    expect(second.innerHTML).toBe(first.innerHTML);
  });

  it("hydrates an existing server-rendered static subtree", () => {
    const host = document.createElement("div");
    host.innerHTML = "<main><h1>Static heading</h1><p>Static content</p></main>";
    document.body.append(host);
    const serverRoot = host.firstElementChild;
    const factory = $staticTemplate("<main><h1>Static heading</h1><p>Static content</p></main>");

    const unmount = hydrateToDOM(
      () => factory() as unknown as JSX.Element,
      host,
    );

    expect(host.firstElementChild).toBe(serverRoot);
    expect(host.textContent).toBe("Static headingStatic content");

    unmount();
    host.remove();
  });

  it("replaces a static subtree when a nested server element is incompatible", () => {
    const host = document.createElement("div");
    host.innerHTML = "<main><h2>Wrong heading</h2><p>Static content</p></main>";
    document.body.append(host);
    const serverRoot = host.firstElementChild;
    const factory = $staticTemplate("<main><h1>Static heading</h1><p>Static content</p></main>");

    const unmount = hydrateToDOM(
      () => factory() as unknown as JSX.Element,
      host,
    );

    expect(host.firstElementChild).not.toBe(serverRoot);
    expect(host.innerHTML).toBe("<main><h1>Static heading</h1><p>Static content</p></main>");

    unmount();
    host.remove();
  });

  it("clones static templates in the active SVG namespace", () => {
    const factory = $staticTemplate('<path d="M0 0L10 10"></path>');
    const path = withDOMNamespace(SVG_NAMESPACE, () => factory());

    expect(path.localName).toBe("path");
    expect(path.namespaceURI).toBe(SVG_NAMESPACE);
    expect(path.getAttribute("d")).toBe("M0 0L10 10");
  });

  it("creates complete static document roots", () => {
    const factory = $staticTemplate(
      '<html lang="en"><head><title>Static document</title></head><body><main>Content</main></body></html>',
    );
    const root = factory();

    expect(root.localName).toBe("html");
    expect(root.querySelector("title")?.textContent).toBe("Static document");
    expect(root.querySelector("main")?.textContent).toBe("Content");
  });

  it("builds static SSR nodes directly from the markup", () => {
    const factory = $staticTemplate("<main><h1>Static heading</h1><p>Static content</p></main>");
    const result = renderToServer(() => factory() as unknown as JSX.Element, "sync");

    expect(result.body).toBe("<main><h1>Static heading</h1><p>Static content</p></main>");
  });
});

describe("$template", () => {
  it("clones static markup and inserts dynamic content at its slot", () => {
    const owner = createTestOwner();
    const factory = $template(
      "<section><!--$v0--><span>static sibling</span><!--$v1--></section>",
    );

    let root!: Element;

    runWithOwner(owner, () => {
      root = factory();
      $attr(root, "title", "bound");
      $insert(root, "dynamic child", "0");
      $insert(root, "second dynamic child", "1");
      $finishTemplate(root);
    });

    expect(root.getAttribute("title")).toBe("bound");
    expect(root.innerHTML).toBe(
      "dynamic child<!--$v0--><span>static sibling</span>second dynamic child<!--$v1-->",
    );

    disposeOwner(owner);
  });

  it("preserves explicit empty text nodes in static markup", () => {
    const owner = createTestOwner();
    const factory = $template('<div><!--$0--><span>after</span></div>');

    let root!: Element;

    runWithOwner(owner, () => {
      root = factory();
      $finishTemplate(root);
    });

    expect(root.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(root.childNodes[0].textContent).toBe("");
    expect(root.childNodes[1]).toBe(root.querySelector("span"));

    disposeOwner(owner);
  });

  it("keeps dynamic bindings attached to the right template instance", async () => {
    const owner = createTestOwner();
    const firstTitle = $state("first");
    const secondTitle = $state("second");
    const factory = $template("<button></button>");

    let first!: Element;
    let second!: Element;

    runWithOwner(owner, () => {
      first = factory();
      second = factory();

      $attr(first, "title", () => firstTitle.value);
      $attr(second, "title", () => secondTitle.value);
    });

    expect(first.getAttribute("title")).toBe("first");
    expect(second.getAttribute("title")).toBe("second");

    firstTitle.value = "updated first";
    await Promise.resolve();
    await Promise.resolve();

    expect(first.getAttribute("title")).toBe("updated first");
    expect(second.getAttribute("title")).toBe("second");

    disposeOwner(owner);
  });

  it("clones SVG templates in the active namespace", () => {
    const owner = createTestOwner();
    const factory = $template('<path d="M0 0L10 10"></path>');

    let path!: Element;

    runWithOwner(owner, () => {
      path = withDOMNamespace(SVG_NAMESPACE, () => factory());
      $attr(path, "stroke-width", "2");
    });

    expect(path.localName).toBe("path");
    expect(path.namespaceURI).toBe(SVG_NAMESPACE);
    expect(path.getAttribute("stroke-width")).toBe("2");

    disposeOwner(owner);
  });

  it("navigates cloned template nodes with native child and sibling helpers", () => {
    const owner = createTestOwner();
    const factory = $template("<main><section>nested</section><footer>after</footer></main>");

    let root!: Element;
    let section!: Element;
    let footer!: Element;

    runWithOwner(owner, () => {
      root = factory();
      section = $child(root);
      footer = $sibling(section);
    });

    expect(section).toBe(root.firstElementChild);
    expect(footer).toBe(root.lastElementChild);

    disposeOwner(owner);
  });

  it("hydrates dynamic children before continuing from the returned slot marker", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");
    host.innerHTML =
      '<main><span>before</span><b>dynamic</b><!--$v0--><span>after</span></main>';

    const rootFactory = $template(
      '<main><span>before</span><!--$v0--><span>after</span></main>',
    );
    const dynamicFactory = $template("<b>dynamic</b>");

    let root!: Element;
    let before!: Element;
    let slot!: Comment;
    let dynamic!: Element;
    let after!: Element;

    runWithOwner(owner, () => {
      withHydration(() => {
        root = rootFactory();
        before = $child(root);
        slot = $insert(root, dynamicFactory, "0") as Comment;
        dynamic = slot.previousSibling as Element;
        after = $sibling(slot);
        $finishTemplate(root);
      }, host);
    });

    expect(root).toBe(host.firstElementChild);
    expect(before).toBe(root.firstElementChild);
    expect(dynamic.localName).toBe("b");
    expect(dynamic).toBe(slot.previousSibling);
    expect(after).toBe(root.lastElementChild);
    expect(root.childNodes[2]).toBe(slot);

    disposeOwner(owner);
  });

  it("claims pre-mapped static nodes before returning a hydration anchor", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");
    host.innerHTML = "<main><span>server text</span><!--$v0--></main>";

    const factory = $template("<main><span>client text</span><!--$v0--></main>");

    let root!: Element;
    let slot!: Comment;

    runWithOwner(owner, () => {
      withHydration(() => {
        root = factory();
        slot = $insert(root, "dynamic child", "0") as Comment;
      }, host);
    });

    expect(root).toBe(host.firstElementChild);
    expect(root.querySelector("span")?.textContent).toBe("client text");
    expect(slot).toBe(root.lastChild);

    disposeOwner(owner);
  });

  it("releases per-instance hydration indexes after finishing a template", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");
    host.innerHTML = "<main><section><span>nested</span></section><footer>after</footer></main>";

    const factory = $template(
      "<main><section><span>nested</span></section><footer>after</footer></main>",
    );
    const deleteSpy = vi.spyOn(WeakMap.prototype, "delete");

    let root!: Element;
    let section!: Element;

    try {
      runWithOwner(owner, () => {
        withHydration(() => {
          root = factory();
          section = $child(root);
          $finishTemplate(root);
        }, host);
      });

      // Every mapped DOM node must stop retaining the finished template instance.
      expect(deleteSpy).toHaveBeenCalledWith(root);
      expect(deleteSpy).toHaveBeenCalledWith(section);
      expect($child(root)).toBe(section);
      expect($sibling(section)).toBe(root.lastElementChild);
    } finally {
      deleteSpy.mockRestore();
    }

    // The cached template factory remains usable after a previous instance retires.
    const secondHost = document.createElement("div");
    secondHost.innerHTML =
      "<main><section><span>nested</span></section><footer>after</footer></main>";

    let secondRoot!: Element;
    runWithOwner(owner, () => {
      withHydration(() => {
        secondRoot = factory();
        $finishTemplate(secondRoot);
      }, secondHost);
    });

    expect(secondRoot).toBe(secondHost.firstElementChild);

    disposeOwner(owner);
  });

  it("navigates nested template children and then continues at a sibling", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");
    host.innerHTML =
      "<main><section><span>nested</span></section><footer>after</footer></main>";

    const factory = $template(
      "<main><section><span>nested</span></section><footer>after</footer></main>",
    );

    let root!: Element;
    let section!: Element;
    let nested!: Element;
    let footer!: Element;

    runWithOwner(owner, () => {
      withHydration(() => {
        root = factory();
        section = $child(root);
        nested = $child(section);
        footer = $sibling(section);
        $finishTemplate(root);
      }, host);
    });

    expect(root).toBe(host.firstElementChild);
    expect(section).toBe(root.firstElementChild);
    expect(nested).toBe(section.firstElementChild);
    expect(footer).toBe(root.lastElementChild);

    disposeOwner(owner);
  });

  it("resolves authored head children when injected stylesheet links precede them", () => {
    document.documentElement.innerHTML = [
      "<head>",
      '<link rel="stylesheet" href="/assets/main.css">',
      "<title>Server title</title>",
      '<meta name="description" content="Server description">',
      "</head>",
      "<body><p>Application text</p></body>",
    ].join("");

    const stylesheet = document.head.querySelector('link[rel="stylesheet"]');
    const owner = createTestOwner();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let title!: Element;

    try {
      runWithOwner(owner, () => {
        withHydration(() => {
          const html = $template(
            '<html><head><title></title><meta name="description" content="Server description"></head><body><p>Application text</p></body></html>',
          )();
          const head = $child(html);
          title = $child(head);

          $insert(title, () => ["Vynn SSR Sandbox ", "0"]);
          $finishTemplate(html);
        }, document);
      });

      expect(title.localName).toBe("title");
      expect(title.textContent).toBe("Vynn SSR Sandbox 0");
      expect(document.head.querySelector('link[rel="stylesheet"]')).toBe(stylesheet);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      disposeOwner(owner);
      document.head.innerHTML = "";
      document.body.innerHTML = "";
    }
  });

  it("builds the SSR node tree from markup and inserts dynamic content at its slot", () => {
    const factory = $template(
      "<main><section>nested</section><!--$v0--><footer>after</footer></main>",
    );

    const result = renderToServer(() => {
      const root = factory();
      const section = $child(root);
      const slot = $insert(root, "dynamic child", "0");
      const footer = $sibling(slot);

      // Both references are SSR_ELEMENT instances at runtime.
      void section;
      void footer;

      return root as unknown as JSX.Element;
    }, "sync");

    expect(result.body).toBe(
      "<main><section>nested</section>dynamic child<!--$v0--><footer>after</footer></main>",
    );
  });
});
