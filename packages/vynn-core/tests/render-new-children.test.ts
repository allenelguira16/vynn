import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import { onScopeDispose } from "../src/render_new";
import {
  createDOMTemplateAdapter,
  mountTemplateProgram,
  type DOMTemplateProgram,
} from "../src/render_new";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new dynamic child slots", () => {
  it("updates primitive children and preserves their static siblings", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const adapter = createDOMTemplateAdapter(document);
    const value = $state<unknown>("first");

    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<p>before<!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__-->after</p>',
        references: [{ id: 0, kind: "anchor", path: [0, 1] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => value.value }],
    };

    const mounted = mountTemplateProgram(parent, program, adapter);
    const paragraph = parent.querySelector("p")!;

    expect(paragraph.textContent).toBe("beforefirstafter");

    value.value = "second";
    expect(paragraph.textContent).toBe("beforesecondafter");

    value.value = null;
    expect(paragraph.textContent).toBe("beforeafter");

    mounted.dispose();
    expect(parent.childNodes).toHaveLength(0);
  });

  it("renders arrays of primitive children in order", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const value = $state<unknown>(["one", 2, "three"]);

    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<div><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></div>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => value.value }],
    };

    const mounted = mountTemplateProgram(parent, program, createDOMTemplateAdapter(document));
    expect(parent.textContent).toBe("one2three");

    value.value = ["four", 5];
    expect(parent.textContent).toBe("four5");

    mounted.dispose();
  });

  it("mounts component programs and disposes replaced child scopes", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const adapter = createDOMTemplateAdapter(document);
    const firstLabel = $state("first component");
    const current = $state<unknown>(null);

    const childProgram: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<strong><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></strong>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => firstLabel.value }],
    };

    current.value = childProgram;

    const parentProgram: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<section><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></section>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => current.value }],
    };

    const mounted = mountTemplateProgram(parent, parentProgram, adapter);
    expect(parent.querySelector("strong")?.textContent).toBe("first component");

    firstLabel.value = "updated in child";
    expect(parent.querySelector("strong")?.textContent).toBe("updated in child");

    current.value = "replacement";
    expect(parent.querySelector("strong")).toBeNull();
    expect(parent.textContent).toBe("replacement");

    mounted.dispose();
    expect(parent.childNodes).toHaveLength(0);
  });

  it("preserves keyed template DOM identity across reorder and updates", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const items = $state([
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ]);

    const rowTemplate = {
      namespace: "html" as const,
      markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>",
      references: [{ id: 0, kind: "anchor" as const, path: [0, 0] }],
    };

    const listProgram: DOMTemplateProgram = {
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

    const mounted = mountTemplateProgram(parent, listProgram, createDOMTemplateAdapter(document));
    const list = parent.querySelector("ul")!;
    const originalA = list.children[0]!;
    const originalB = list.children[1]!;

    expect(Array.from(list.children).map((node) => node.textContent)).toEqual([
      "Alpha",
      "Beta",
    ]);

    items.value = [
      { id: "b", label: "Beta updated" },
      { id: "a", label: "Alpha updated" },
      { id: "c", label: "Gamma" },
    ];

    expect(list.children).toHaveLength(3);
    expect(list.children[0]).toBe(originalB);
    expect(list.children[1]).toBe(originalA);
    expect(Array.from(list.children).map((node) => node.textContent)).toEqual([
      "Beta updated",
      "Alpha updated",
      "Gamma",
    ]);

    items.value = [{ id: "a", label: "Only A" }];
    expect(list.children).toHaveLength(1);
    expect(list.children[0]).toBe(originalA);
    expect(list.textContent).toBe("Only A");

    mounted.dispose();
    expect(parent.childNodes).toHaveLength(0);
  });

  it("rejects duplicate keys before changing the current keyed list", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const items = $state([{ id: "one", label: "One" }]);
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
          bindings: [{ kind: "child" as const, reference: 0, read: () => item.label }],
          key: item.id,
        })),
      }],
    };

    const mounted = mountTemplateProgram(parent, program, createDOMTemplateAdapter(document));
    const original = parent.querySelector("li");
    expect(() => {
      items.value = [
        { id: "duplicate", label: "First" },
        { id: "duplicate", label: "Second" },
      ];
    }).toThrow("Duplicate key");

    expect(parent.querySelector("li")).toBe(original);
    expect(parent.textContent).toContain("One");
    mounted.dispose();
  });

  it("removes stale keyed ranges even when an item cleanup throws", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const items = $state([
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
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
            read: () => {
              if (item.id !== "b") {
                onScopeDispose(() => {
                  throw new Error(item.id + " cleanup failed");
                });
              }
              return item.label;
            },
          }],
          key: item.id,
        })),
      }],
    };

    const mounted = mountTemplateProgram(parent, program, createDOMTemplateAdapter(document));
    const list = parent.querySelector("ul")!;
    const originalB = list.children[1]!;

    let cleanupFailure: unknown;
    try {
      items.value = [{ id: "b", label: "Beta" }];
    } catch (error) {
      cleanupFailure = error;
    }

    expect(cleanupFailure).toBeInstanceOf(AggregateError);
    expect((cleanupFailure as AggregateError).errors).toHaveLength(2);
    expect(list.children).toHaveLength(1);
    expect(list.children[0]).toBe(originalB);
    expect(list.textContent).toBe("Beta");

    mounted.dispose();
  });

  it("does not stringify unsupported render values", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: "<div><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></div>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => ({ arbitrary: true }) }],
    };

    expect(() =>
      mountTemplateProgram(parent, program, createDOMTemplateAdapter(document)),
    ).toThrow("Dynamic children must be renderable primitives");
    expect(parent.childNodes).toHaveLength(0);
  });
});
