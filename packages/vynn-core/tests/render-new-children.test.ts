import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
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
