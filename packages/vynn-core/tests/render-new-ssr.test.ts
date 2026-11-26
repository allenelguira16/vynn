import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import { createRenderNewComponent } from "../src/render_new/component";
import {
  createDOMTemplateAdapter,
  hydrateRenderNew,
  mountTemplateProgram,
  renderTemplateProgramToString,
} from "../src/render_new";
import type { DOMTemplateProgram } from "../src/render_new/dom/program";

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

  it("serializes keyed template programs with stable item boundary markers", () => {
    const items = $state([
      { id: "alpha", label: "Alpha" },
      { id: "beta", label: "Beta" },
    ]);
    const rowTemplate = {
      namespace: "html" as const,
      markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<ul><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></ul>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{
        kind: "child",
        reference: 0,
        read: () => items.value.map((item) => ({
          template: rowTemplate,
          bindings: [{
            kind: "child" as const,
            reference: 0,
            read: () => item.label,
          }],
          key: item.id,
        })),
      }],
    };

    const html = renderTemplateProgramToString(program);

    expect(html).toContain(
      "<!--__vynn_render_new_keyed_item_s_0061006c007000680061_start__--><li>",
    );
    expect(html).toContain(
      "<!--__vynn_render_new_keyed_item_s_0062006500740061_start__--><li>",
    );
    expect(html.indexOf("__vynn_render_new_keyed_item_s_0061006c007000680061_start__"))
      .toBeLessThan(html.indexOf("__vynn_render_new_keyed_item_s_0062006500740061_start__"));
    expect(html).toContain("__vynn_render_new_keyed_item_s_0061006c007000680061_end__");
    expect(html).toContain("__vynn_render_new_keyed_item_s_0062006500740061_end__");
  });

  it("validates duplicate SSR keys before evaluating item bindings", () => {
    let itemReads = 0;
    const rowTemplate = {
      namespace: "html" as const,
      markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };
    const row = {
      template: rowTemplate,
      bindings: [{
        kind: "child" as const,
        reference: 0,
        read: () => {
          itemReads += 1;
          return "row";
        },
      }],
    };
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<ul><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></ul>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{
        kind: "child",
        reference: 0,
        read: () => [
          { ...row, key: "duplicate" },
          { ...row, key: "duplicate" },
        ],
      }],
    };

    expect(() => renderTemplateProgramToString(program)).toThrow("Duplicate key");
    expect(itemReads).toBe(0);
  });

  it("hydrates keyed server items in place and reconciles them by key", () => {
    const document = createDocument();
    const container = document.createElement("div");
    const listTemplate = {
      namespace: "html" as const,
      markup: "<ul><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></ul>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };
    const rowTemplate = {
      namespace: "html" as const,
      markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };
    const createProgram = (
      readItems: () => Array<{ id: string; label: string }>,
    ): DOMTemplateProgram => ({
      template: listTemplate,
      bindings: [{
        kind: "child",
        reference: 0,
        read: () => readItems().map((item) => ({
          template: rowTemplate,
          bindings: [{
            kind: "child" as const,
            reference: 0,
            read: () => item.label,
          }],
          key: item.id,
        })),
      }],
    });

    const serverItems = $state([
      { id: "alpha", label: "Alpha from server" },
      { id: "beta", label: "Beta from server" },
    ]);
    container.innerHTML = renderTemplateProgramToString(
      createProgram(() => serverItems.value),
    );
    const serverRows = Array.from(container.querySelectorAll("li"));
    const originalAlpha = serverRows[0]!;
    const originalBeta = serverRows[1]!;

    const clientItems = $state([
      { id: "beta", label: "Beta from client" },
      { id: "alpha", label: "Alpha from client" },
      { id: "gamma", label: "Gamma from client" },
    ]);
    const mounted = hydrateRenderNew(container, createProgram(() => clientItems.value));

    const list = container.querySelector("ul")!;
    const hydratedRows = Array.from(list.querySelectorAll("li"));
    expect(hydratedRows[0]).toBe(originalBeta);
    expect(hydratedRows[1]).toBe(originalAlpha);
    expect(hydratedRows[2]).not.toBe(originalAlpha);
    expect(hydratedRows.map((row) => row.textContent)).toEqual([
      "Beta from client",
      "Alpha from client",
      "Gamma from client",
    ]);

    const originalGamma = hydratedRows[2]!;
    clientItems.value = [
      { id: "alpha", label: "Alpha updated" },
      { id: "gamma", label: "Gamma updated" },
    ];

    const updatedRows = Array.from(list.querySelectorAll("li"));
    expect(updatedRows).toHaveLength(2);
    expect(updatedRows[0]).toBe(originalAlpha);
    expect(updatedRows[1]).toBe(originalGamma);
    expect(updatedRows.map((row) => row.textContent)).toEqual([
      "Alpha updated",
      "Gamma updated",
    ]);

    mounted.dispose();
    expect(container.childNodes).toHaveLength(0);
  });

  it("remounts only a keyed item whose server structure is incompatible", () => {
    const document = createDocument();
    const container = document.createElement("div");
    const listTemplate = {
      namespace: "html" as const,
      markup: "<ul><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></ul>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };
    const serverRowTemplate = {
      namespace: "html" as const,
      markup: "<li><span><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></span></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0, 0] }],
    };
    const clientAlphaTemplate = {
      namespace: "html" as const,
      markup: "<li><strong><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></strong></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0, 0] }],
    };
    const createProgram = (
      readItems: () => Array<{ id: string; label: string }>,
      client: boolean,
    ): DOMTemplateProgram => ({
      template: listTemplate,
      bindings: [{
        kind: "child",
        reference: 0,
        read: () => readItems().map((item) => ({
          template: client && item.id === "alpha" ? clientAlphaTemplate : serverRowTemplate,
          bindings: [{
            kind: "child" as const,
            reference: 0,
            read: () => item.label,
          }],
          key: item.id,
        })),
      }],
    });

    const serverItems = $state([
      { id: "alpha", label: "Alpha server" },
      { id: "beta", label: "Beta server" },
    ]);
    container.innerHTML = renderTemplateProgramToString(
      createProgram(() => serverItems.value, false),
    );
    const originalRows = Array.from(container.querySelectorAll("li"));
    const originalBeta = originalRows[1]!;

    const clientItems = $state([
      { id: "alpha", label: "Alpha client" },
      { id: "beta", label: "Beta client" },
    ]);
    const mounted = hydrateRenderNew(
      container,
      createProgram(() => clientItems.value, true),
    );

    const rows = Array.from(container.querySelectorAll("li"));
    expect(rows[0]).not.toBe(originalRows[0]);
    expect(rows[0]?.querySelector("strong")?.textContent).toBe("Alpha client");
    expect(rows[1]).toBe(originalBeta);
    expect(rows[1]?.textContent).toBe("Beta client");

    mounted.dispose();
  });

  it("serializes, hydrates, and updates keyed component instances", () => {
    const document = createDocument();
    const container = document.createElement("div");
    const listTemplate = {
      namespace: "html" as const,
      markup: "<ul><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></ul>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };
    const rowTemplate = {
      namespace: "html" as const,
      markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };

    function Row(props: { label: string }) {
      return createRenderNewComponent(
        () => ({
          template: rowTemplate,
          bindings: [{
            kind: "child" as const,
            reference: 0,
            read: () => props.label,
          }],
        }),
        props,
        Row,
      );
    }

    const createListProgram = (
      readItems: () => Array<{ id: string; label: string }>,
    ): DOMTemplateProgram => ({
      template: listTemplate,
      bindings: [{
        kind: "child",
        reference: 0,
        read: () => readItems().map((item) =>
          Object.assign(Row({ label: item.label }), { key: item.id }),
        ),
      }],
    });

    const serverItems = [
      { id: "alpha", label: "Alpha from server" },
      { id: "beta", label: "Beta from server" },
    ];
    const html = renderTemplateProgramToString(
      createListProgram(() => serverItems),
    );

    expect(html).toContain(
      "<!--__vynn_render_new_keyed_item_s_0061006c007000680061_start__--><li>",
    );
    expect(html).toContain(
      "<!--__vynn_render_new_keyed_item_s_0062006500740061_start__--><li>",
    );

    container.innerHTML = html;
    const originalAlpha = container.querySelectorAll("li")[0]!;
    const originalBeta = container.querySelectorAll("li")[1]!;

    const clientItems = $state([
      { id: "beta", label: "Beta from client" },
      { id: "alpha", label: "Alpha from client" },
      { id: "gamma", label: "Gamma from client" },
    ]);
    const mounted = hydrateRenderNew(
      container,
      createListProgram(() => clientItems.value),
    );

    const list = container.querySelector("ul")!;
    expect(list.children[0]).toBe(originalBeta);
    expect(list.children[1]).toBe(originalAlpha);
    expect(list.children[2]).not.toBe(originalAlpha);
    expect(Array.from(list.children).map((node) => node.textContent)).toEqual([
      "Beta from client",
      "Alpha from client",
      "Gamma from client",
    ]);

    const originalGamma = list.children[2]!;
    clientItems.value = [
      { id: "alpha", label: "Alpha updated" },
      { id: "gamma", label: "Gamma updated" },
    ];

    expect(list.children).toHaveLength(2);
    expect(list.children[0]).toBe(originalAlpha);
    expect(list.children[1]).toBe(originalGamma);
    expect(Array.from(list.children).map((node) => node.textContent)).toEqual([
      "Alpha updated",
      "Gamma updated",
    ]);

    mounted.dispose();
    expect(container.childNodes).toHaveLength(0);
  });

  it("mounts a complete HTML document by replacing the existing document root", () => {
    const document = createDocument();
    const originalRoot = document.documentElement;
    const message = $state("Mounted document content");
    const language = $state("en-PH");
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<html><head><title>Vynn test</title></head><body><main><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></main></body></html>',
        references: [
          { id: 0, kind: "element", path: [0] },
          { id: 1, kind: "anchor", path: [0, 1, 0, 0] },
        ],
      },
      bindings: [
        { kind: "attribute", reference: 0, name: "lang", read: () => language.value },
        { kind: "child", reference: 1, read: () => message.value },
      ],
    };

    const mounted = mountTemplateProgram(
      document,
      program,
      createDOMTemplateAdapter(document),
    );

    expect(document.documentElement).not.toBe(originalRoot);
    expect(document.documentElement?.getAttribute("lang")).toBe("en-PH");
    expect(document.querySelector("title")?.textContent).toBe("Vynn test");
    expect(document.querySelector("main")?.textContent).toBe("Mounted document content");

    language.value = "en-US";
    message.value = "Updated document content";

    expect(document.documentElement?.getAttribute("lang")).toBe("en-US");
    expect(document.querySelector("main")?.textContent).toBe("Updated document content");

    mounted.dispose();
    expect(document.documentElement).toBeNull();
  });

  it("hydrates a full HTML document in place and leaves the document root on dispose", () => {
    const message = $state("Server document content");
    const language = $state("en-PH");
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<html><head><title>Hydrated Vynn</title></head><body><main><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></main></body></html>',
        references: [
          { id: 0, kind: "element", path: [0] },
          { id: 1, kind: "anchor", path: [0, 1, 0, 0] },
        ],
      },
      bindings: [
        { kind: "attribute", reference: 0, name: "lang", read: () => language.value },
        { kind: "child", reference: 1, read: () => message.value },
      ],
    };

    const html = renderTemplateProgramToString(program)
      .replace(
        "</head>",
        '<!--vynn:internal:start--><link rel="stylesheet" href="/assets/app.css"><!--vynn:internal:end--></head>',
      )
      .replace(
        "</body>",
        '<!--vynn:internal:start--><script type="module" src="/assets/client.js"></script><!--vynn:internal:end--></body>',
      );
    const hydratedDocument = new JSDOM("<!doctype html>" + html).window.document;
    const originalRoot = hydratedDocument.documentElement;

    const mounted = hydrateRenderNew(hydratedDocument, program);

    expect(hydratedDocument.documentElement).toBe(originalRoot);
    expect(hydratedDocument.querySelector("main")?.textContent).toBe("Server document content");

    message.value = "Hydrated document update";
    language.value = "en-US";

    expect(hydratedDocument.querySelector("main")?.textContent).toBe("Hydrated document update");
    expect(hydratedDocument.documentElement.getAttribute("lang")).toBe("en-US");

    mounted.dispose();
    expect(hydratedDocument.documentElement).toBe(originalRoot);
  });

});
