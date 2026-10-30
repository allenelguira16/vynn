// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $attr } from "../src/render/$attr";
import { $for } from "../src/render/$for";
import { $if } from "../src/render/$if";
import { $insert } from "../src/render/$insert";
import { $nodes } from "../src/render/$nodes";
import { $on } from "../src/render/$on";
import { $tmpl } from "../src/render/$tmpl";
import { withHydration } from "../src/client/hydration";
import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { $state } from "../src/reactivity/$state";
import { renderToServer } from "../src/server/render-to-server";
import { createSSRAsync } from "../src/render/resolve-node";
import type { SSR_NODE } from "../src/render/resolve-node";
import type { JSX } from "../src/types/jsx";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SVG namespace rendering", () => {
  it("claims nested SVG elements from the SSR hydration queue in order", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<svg viewBox="0 0 24 24"><g><path stroke-width="2"></path></g></svg><p>after</p>';

    const serverSvg = root.querySelector("svg");
    const serverGroup = root.querySelector("g");
    const serverPath = root.querySelector("path");
    const serverParagraph = root.querySelector("p");

    const owner = createOwner();
    let svg!: Element;
    let group!: Element;
    let path!: Element;
    let paragraph!: Element;

    runWithOwner(owner, () => {
      withHydration(() => {
        svg = $tmpl("svg");

        $insert(svg, () => {
          group = $tmpl("g");

          $insert(group, () => {
            path = $tmpl("path");
            return path as unknown as JSX.Element;
          });

          return group as unknown as JSX.Element;
        });

        paragraph = $tmpl("p");
      }, root);
    });

    expect(svg).toBe(serverSvg);
    expect(group).toBe(serverGroup);
    expect(path).toBe(serverPath);
    expect(paragraph).toBe(serverParagraph);
    expect(svg.namespaceURI).toBe(SVG_NAMESPACE);
    expect(group.namespaceURI).toBe(SVG_NAMESPACE);
    expect(path.namespaceURI).toBe(SVG_NAMESPACE);

    disposeOwner(owner);
  });

  it("creates SVG elements across component boundaries and handles foreignObject", () => {
    const host = document.createElement("div");
    const owner = createOwner();

    let svg!: Element;
    let foreignObject!: Element;
    let htmlDiv!: Element;
    let nestedSvg!: Element;
    let path!: Element;

    const SvgChild = () => {
      path = $tmpl("path");
      return path as unknown as JSX.Element;
    };

    runWithOwner(owner, () => {
      svg = $tmpl("svg");

      $insert(svg, () => {
        foreignObject = $tmpl("foreignObject");

        $insert(foreignObject, () => {
          htmlDiv = $tmpl("div");

          $insert(htmlDiv, () => {
            nestedSvg = $tmpl("svg");
            $insert(nestedSvg, () => SvgChild());
            return nestedSvg as unknown as JSX.Element;
          });

          return htmlDiv as unknown as JSX.Element;
        });

        return foreignObject as unknown as JSX.Element;
      });

      host.append(svg);
    });

    expect(svg.namespaceURI).toBe(SVG_NAMESPACE);
    expect(foreignObject.namespaceURI).toBe(SVG_NAMESPACE);
    expect(htmlDiv.namespaceURI).toBe(HTML_NAMESPACE);
    expect(nestedSvg.namespaceURI).toBe(SVG_NAMESPACE);
    expect(path.namespaceURI).toBe(SVG_NAMESPACE);
    expect(path.parentNode).toBe(nestedSvg);

    disposeOwner(owner);
  });

  it("preserves the namespace for later $nodes updates", async () => {
    const host = document.createElement("div");
    const owner = createOwner();
    const items = $state([1]);

    let svg!: Element;

    runWithOwner(owner, () => {
      svg = $tmpl("svg");

      $insert(svg, () =>
        $nodes(() =>
          items.value.map((item) => {
            const circle = $tmpl("circle");
            $attr(circle, "data-id", item);
            return circle as unknown as JSX.Element;
          }),
        ),
      );

      host.append(svg);
    });

    await flushEffects();
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector("circle")?.namespaceURI).toBe(SVG_NAMESPACE);

    items.value = [1, 2];
    await flushEffects();

    expect(svg.querySelectorAll("circle")).toHaveLength(2);
    expect([...svg.querySelectorAll("circle")].every(
      (circle) => circle.namespaceURI === SVG_NAMESPACE,
    )).toBe(true);

    disposeOwner(owner);
  });

  it("preserves the namespace when $if creates a branch after the initial render", async () => {
    const host = document.createElement("div");
    const owner = createOwner();
    const visible = $state(false);

    let svg!: Element;

    runWithOwner(owner, () => {
      svg = $tmpl("svg");
      $insert(svg, () =>
        $if(
          () => visible.value,
          () => {
            const circle = $tmpl("circle");
            return circle as unknown as JSX.Element;
          },
        ),
      );
      host.append(svg);
    });

    visible.value = true;
    await flushEffects();

    const circle = svg.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle?.namespaceURI).toBe(SVG_NAMESPACE);

    disposeOwner(owner);
  });

  it("preserves the namespace when $for creates new entries", async () => {
    const host = document.createElement("div");
    const owner = createOwner();
    const items = $state([1]);

    let svg!: Element;

    runWithOwner(owner, () => {
      svg = $tmpl("svg");
      $insert(svg, () =>
        $for(
          () => items.value,
          (item) => {
            const circle = $tmpl("circle");
            $attr(circle, "data-id", item);
            return circle as unknown as JSX.Element;
          },
        ),
      );
      host.append(svg);
    });

    items.value = [1, 2];
    await flushEffects();

    const circles = [...svg.querySelectorAll("circle")];
    expect(circles).toHaveLength(2);
    expect(circles.every((circle) => circle.namespaceURI === SVG_NAMESPACE)).toBe(true);

    disposeOwner(owner);
  });

  it("normalizes SVG attributes and supports namespaced attributes and events", () => {
    const owner = createOwner();
    const svg = document.createElementNS(SVG_NAMESPACE, "use");
    const width = $state(2);
    let clicked = false;

    runWithOwner(owner, () => {
      $attr(svg, "strokeWidth", () => width.value);
      $attr(svg, "viewBox", "0 0 10 10");
      $attr(svg, "xlinkHref", "#shape");
      $on(svg, "click", () => {
        clicked = true;
      });
    });

    expect(svg.getAttribute("stroke-width")).toBe("2");
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10");
    expect(svg.getAttributeNS(XLINK_NAMESPACE, "href")).toBe("#shape");

    width.value = 4;
    expect(svg.getAttribute("stroke-width")).toBe("4");

    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toBe(true);

    disposeOwner(owner);
  });

  it("hydrates directly into an SVG mount element", () => {
    const root = document.createElementNS(SVG_NAMESPACE, "svg");
    root.innerHTML = '<path d="M0 0"></path>';
    const serverPath = root.querySelector("path");

    const unmount = hydrateToDOM(() => {
      const path = $tmpl("path");
      return path as unknown as JSX.Element;
    }, root);

    expect(root.querySelector("path")).toBe(serverPath);
    expect(serverPath?.namespaceURI).toBe(SVG_NAMESPACE);

    unmount();
  });

  it("preserves the SVG namespace in deferred SSR children", async () => {
    const rendered = renderToServer(() => {
      const svg = $tmpl("svg");

      $insert(svg, () =>
        createSSRAsync(
          () => [],
          () => {
            const path = $tmpl("path");
            $attr(path, "strokeWidth", 3);
            return [path as unknown as SSR_NODE];
          },
          [Promise.resolve()],
        ) as unknown as JSX.Element,
      );

      return svg as unknown as JSX.Element;
    }, "async");

    const html = await (rendered as Promise<string>);

    expect(html).toContain('<svg><path stroke-width="3"></path></svg>');
  });

  it("serializes SVG attribute names and foreignObject descendants correctly", async () => {
    const rendered = renderToServer(() => {
      const svg = $tmpl("svg");
      $attr(svg, "viewBox", "0 0 24 24");

      $insert(svg, () => {
        const path = $tmpl("path");
        $attr(path, "strokeWidth", 2);
        $attr(path, "fillRule", "evenodd");
        return path as unknown as JSX.Element;
      });

      $insert(svg, () => {
        const foreignObject = $tmpl("foreignObject");

        $insert(foreignObject, () => {
          const div = $tmpl("div");
          $attr(div, "className", "inside");
          return div as unknown as JSX.Element;
        });

        return foreignObject as unknown as JSX.Element;
      });

      return svg as unknown as JSX.Element;
    }, "async");

    const html = await (rendered as Promise<string>);

    expect(html).toContain('<svg viewBox="0 0 24 24">');
    expect(html).toContain('<path stroke-width="2" fill-rule="evenodd"></path>');
    expect(html).toContain('<foreignObject><div class="inside"></div></foreignObject>');
  });
});
