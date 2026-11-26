import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import { hydrateRenderNew } from "../src/render_new/dom/hydrate-client";
import type { DOMTemplateProgram } from "../src/render_new/dom/program";
import { renderTemplateProgramToString } from "../src/render_new/ssr/render";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new SSR and hydration", () => {
  it("serializes dynamic attributes and child text with stable range markers", () => {
    const title = $state("Initial & title");
    const message = $state("Hello <Vynn>");
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<main><p><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></p></main>',
        references: [
          { id: 0, kind: "element", path: [0] },
          { id: 1, kind: "anchor", path: [0, 0, 0] },
        ],
      },
      bindings: [
        { kind: "attribute", reference: 0, name: "title", read: () => title.value },
        { kind: "child", reference: 1, read: () => message.value },
      ],
    };

    const html = renderTemplateProgramToString(program);

    expect(html).toBe(
      '<main title="Initial &amp; title"><p><!--__vynn_render_new_child_0_start__-->Hello &lt;Vynn&gt;<!--__vynn_render_new_child_0_end__--></p></main>',
    );
  });

  it("hydrates matching server DOM in place and keeps child node identity initially", () => {
    const document = createDocument();
    const container = document.createElement("div");
    const title = $state("Server title");
    const message = $state("Server text");
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<main><p><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></p></main>',
        references: [
          { id: 0, kind: "element", path: [0] },
          { id: 1, kind: "anchor", path: [0, 0, 0] },
        ],
      },
      bindings: [
        { kind: "attribute", reference: 0, name: "title", read: () => title.value },
        { kind: "child", reference: 1, read: () => message.value },
      ],
    };

    container.innerHTML = renderTemplateProgramToString(program);
    const serverRoot = container.firstElementChild;
    const serverParagraph = container.querySelector("p");
    const serverText = serverParagraph?.firstChild?.nextSibling;
    const mounted = hydrateRenderNew(container, program);

    expect(container.firstElementChild).toBe(serverRoot);
    expect(container.querySelector("p")).toBe(serverParagraph);
    expect(serverParagraph?.childNodes[1]).toBe(serverText);
    expect(serverParagraph?.textContent).toBe("Server text");
    expect((serverRoot as HTMLElement).getAttribute("title")).toBe("Server title");

    title.value = "Client title";
    message.value = "Client update";

    expect((serverRoot as HTMLElement).getAttribute("title")).toBe("Client title");
    expect(serverParagraph?.textContent).toBe("Client update");

    mounted.dispose();
    expect(container.childNodes).toHaveLength(0);
  });

  it("hydrates nested component programs recursively", () => {
    const document = createDocument();
    const container = document.createElement("div");
    const label = $state("Nested server value");

    const child: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<strong><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></strong>',
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => label.value }],
    };

    const parent: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<main><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></main>',
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => child }],
    };

    container.innerHTML = renderTemplateProgramToString(parent);
    const serverMain = container.firstElementChild;
    const serverStrong = container.querySelector("strong");
    const mounted = hydrateRenderNew(container, parent);

    expect(container.firstElementChild).toBe(serverMain);
    expect(container.querySelector("strong")).toBe(serverStrong);
    expect(serverStrong?.textContent).toBe("Nested server value");

    label.value = "Nested client value";
    expect(serverStrong?.textContent).toBe("Nested client value");

    mounted.dispose();
  });

  it("replaces incompatible server markup with a fresh template mount", () => {
    const document = createDocument();
    const container = document.createElement("div");
    container.innerHTML = "<aside>old content</aside>";

    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<main>new content</main>",
        references: [],
      },
      bindings: [],
    };

    const mounted = hydrateRenderNew(container, program);

    expect(container.innerHTML).toBe("<main>new content</main>");
    expect(container.querySelector("aside")).toBeNull();

    mounted.dispose();
    expect(container.childNodes).toHaveLength(0);
  });

  it("renders arrays of primitives to a single text range", () => {
    const value = $state<unknown>(["one", 2, "three"]);
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<div><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></div>',
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => value.value }],
    };

    expect(renderTemplateProgramToString(program)).toContain(
      "<div><!--__vynn_render_new_child_0_start__-->one2three<!--__vynn_render_new_child_0_end__--></div>",
    );
  });
});
