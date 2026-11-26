import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import { applyTemplateBindings } from "../src/render_new/binding/instructions";
import {
  createScope,
  disposeScope,
  runWithScope,
} from "../src/render_new/lifecycle/scope";
import {
  createDOMTemplateAdapter,
  mountTemplateProgram,
  type DOMTemplateProgram,
} from "../src/render_new";

const templateDefinition = {
  namespace: "html" as const,
  markup: '<button title="static">Start</button>',
  references: [
    { id: 0, kind: "element" as const, path: [0] },
    { id: 1, kind: "text" as const, path: [0, 0] },
  ],
};

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

function createClick(document: Document): Event {
  const EventConstructor = document.defaultView?.Event;
  if (!EventConstructor) throw new Error("Expected a DOM Window.");
  return new EventConstructor("click");
}

describe("render_new template programs", () => {
  it("mounts a compiler-shaped program and applies all four binding kinds", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const adapter = createDOMTemplateAdapter(document);
    const label = $state("Initial");
    const title = $state("Initial title");
    const value = $state<unknown>({ id: 1 });
    const firstHandler = vi.fn();
    const handler = $state(firstHandler);

    const program: DOMTemplateProgram = {
      template: templateDefinition,
      bindings: [
        { kind: "text", reference: 1, read: () => label.value },
        { kind: "attribute", reference: 0, name: "title", read: () => title.value },
        { kind: "property", reference: 0, name: "customValue", read: () => value.value },
        { kind: "event", reference: 0, event: "click", read: () => handler.value },
      ],
    };

    const mounted = mountTemplateProgram(parent, program, adapter);
    const button = parent.firstElementChild as HTMLButtonElement;

    expect(button.textContent).toBe("Initial");
    expect(button.getAttribute("title")).toBe("Initial title");
    expect((button as unknown as { customValue: unknown }).customValue).toEqual({
      id: 1,
    });

    button.dispatchEvent(createClick(document));
    expect(firstHandler).toHaveBeenCalledTimes(1);

    const nextHandler = vi.fn();
    label.value = "Updated";
    title.value = "Updated title";
    value.value = 42;
    handler.value = nextHandler;

    expect(button.textContent).toBe("Updated");
    expect(button.getAttribute("title")).toBe("Updated title");
    expect((button as unknown as { customValue: unknown }).customValue).toBe(42);

    button.dispatchEvent(createClick(document));
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(nextHandler).toHaveBeenCalledTimes(1);

    mounted.dispose();
    expect(mounted.mounted).toBe(false);
    expect(parent.childNodes).toHaveLength(0);
  });

  it("creates independent DOM instances from the same program", () => {
    const document = createDocument();
    const firstParent = document.createElement("main");
    const secondParent = document.createElement("aside");
    const adapter = createDOMTemplateAdapter(document);
    const label = $state("Shared");

    const program: DOMTemplateProgram = {
      template: templateDefinition,
      bindings: [
        { kind: "text", reference: 1, read: () => label.value },
      ],
    };

    const first = mountTemplateProgram(firstParent, program, adapter);
    const second = mountTemplateProgram(secondParent, program, adapter);
    const firstButton = firstParent.firstElementChild as HTMLButtonElement;
    const secondButton = secondParent.firstElementChild as HTMLButtonElement;

    expect(firstButton).not.toBe(secondButton);
    expect(firstButton.textContent).toBe("Shared");
    expect(secondButton.textContent).toBe("Shared");

    label.value = "Changed";

    expect(firstButton.textContent).toBe("Changed");
    expect(secondButton.textContent).toBe("Changed");

    first.dispose();
    expect(firstParent.childNodes).toHaveLength(0);
    expect(secondParent.childNodes).toHaveLength(1);

    label.value = "Second remains";
    expect(secondButton.textContent).toBe("Second remains");

    second.dispose();
  });

  it("supports insertion before an existing sibling", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const existing = document.createElement("footer");
    parent.append(existing);

    const program: DOMTemplateProgram = {
      template: templateDefinition,
      bindings: [],
    };

    const mounted = mountTemplateProgram(
      parent,
      program,
      createDOMTemplateAdapter(document),
      existing,
    );

    expect(parent.children[0]?.tagName).toBe("BUTTON");
    expect(parent.children[1]).toBe(existing);

    mounted.dispose();
  });

  it("rejects missing reference IDs before installing any binding", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const instance = adapter.clone(
      adapter.parse(templateDefinition.markup, templateDefinition.namespace),
    );
    const templateInstance = {
      roots: instance,
      references: new Map<number, Node>([
        [0, instance[0]],
        [1, instance[0].childNodes[0] as Node],
      ]),
    };
    const scope = createScope(null);
    const value = $state("before");

    expect(() =>
      applyTemplateBindings(scope, templateInstance, [
        { kind: "text", reference: 1, read: () => value.value },
        { kind: "text", reference: 999, read: () => value.value },
      ]),
    ).toThrow("references missing node 999");

    const text = templateInstance.references.get(1) as Text;
    value.value = "after";
    expect(text.data).toBe("Start");

    disposeScope(scope);
  });

  it("rejects binding instructions whose reference kind is wrong", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const instance = adapter.clone(
      adapter.parse(templateDefinition.markup, templateDefinition.namespace),
    );
    const templateInstance = {
      roots: instance,
      references: new Map<number, Node>([[0, instance[0]]]),
    };
    const scope = createScope(null);

    expect(() =>
      applyTemplateBindings(scope, templateInstance, [
        { kind: "text", reference: 0, read: () => "wrong target" },
      ]),
    ).toThrow("text binding must target a text reference");

    disposeScope(scope);
  });

  it("rolls back earlier instructions when a later binding is invalid", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const roots = adapter.clone(
      adapter.parse(templateDefinition.markup, templateDefinition.namespace),
    );
    const button = roots[0] as HTMLButtonElement;
    const text = button.firstChild as Text;
    const templateInstance = {
      roots,
      references: new Map<number, Node>([
        [0, button],
        [1, text],
      ]),
    };
    const scope = createScope(null);
    const label = $state("Initial");

    expect(() =>
      applyTemplateBindings(scope, templateInstance, [
        { kind: "text", reference: 1, read: () => label.value },
        { kind: "attribute", reference: 0, name: "", read: () => "invalid" },
      ]),
    ).toThrow("non-empty attribute name");

    label.value = "Should not update";
    expect(text.data).toBe("Initial");

    disposeScope(scope);
  });

  it("cleans up the template when program initialization fails", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const adapter = createDOMTemplateAdapter(document);
    const program: DOMTemplateProgram = {
      template: templateDefinition,
      bindings: [
        {
          kind: "attribute",
          reference: 0,
          name: "",
          read: () => "invalid",
        },
      ],
    };

    expect(() => mountTemplateProgram(parent, program, adapter)).toThrow(
      "non-empty attribute name",
    );
    expect(parent.childNodes).toHaveLength(0);
  });

  it("initializes bindings before inserting roots into the parent", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const observations: Array<{ title: string | null; text: string | null }> = [];
    const view = document.defaultView;

    if (!view) throw new Error("Expected a DOM Window.");

    class VynnProbeElement extends view.HTMLElement {
      connectedCallback() {
        observations.push({
          title: this.getAttribute("title"),
          text: this.textContent,
        });
      }
    }

    view.customElements.define("vynn-probe", VynnProbeElement);

    const program: DOMTemplateProgram = {
      template: {
        namespace: "html",
        markup: '<vynn-probe title="static">Start</vynn-probe>',
        references: [
          { id: 0, kind: "element", path: [0] },
          { id: 1, kind: "text", path: [0, 0] },
        ],
      },
      bindings: [
        { kind: "attribute", reference: 0, name: "title", read: () => "ready" },
        { kind: "text", reference: 1, read: () => "Mounted" },
      ],
    };

    const mounted = mountTemplateProgram(
      parent,
      program,
      createDOMTemplateAdapter(document),
    );

    expect(observations).toEqual([{ title: "ready", text: "Mounted" }]);
    mounted.dispose();
  });

  it("disposes mounted bindings when an ancestor render scope is disposed", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const adapter = createDOMTemplateAdapter(document);
    const label = $state("Before");
    const handler = vi.fn();
    let mounted: ReturnType<typeof mountTemplateProgram> | undefined;

    const activeOwner = createScope(null);
    try {
      // Create the mount while the parent render scope is current.
      runWithScope(activeOwner, () => {
        mounted = mountTemplateProgram(
          parent,
          {
            template: templateDefinition,
            bindings: [
              { kind: "text", reference: 1, read: () => label.value },
              {
                kind: "event",
                reference: 0,
                event: "click",
                read: () => handler,
              },
            ],
          },
          adapter,
        );
      });

      expect(parent.textContent).toBe("Before");
      disposeScope(activeOwner);
      expect(parent.childNodes).toHaveLength(0);

      label.value = "After";
      const button = mounted?.instance.roots[0] as HTMLButtonElement;
      button.dispatchEvent(createClick(document));
      expect(handler).not.toHaveBeenCalled();
    } finally {
      if (activeOwner.state !== "disposed") disposeScope(activeOwner);
    }
  });

  it("rolls back initialized bindings when insertion fails", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    const invalidBefore = document.createElement("footer");
    const label = $state("Initial");
    const program: DOMTemplateProgram = {
      template: templateDefinition,
      bindings: [
        { kind: "text", reference: 1, read: () => label.value },
      ],
    };

    expect(() =>
      mountTemplateProgram(
        parent,
        program,
        createDOMTemplateAdapter(document),
        invalidBefore,
      ),
    ).toThrow();

    expect(parent.childNodes).toHaveLength(0);
    label.value = "Changed";
  });

  it("validates a malformed program before touching the parent", () => {
    const document = createDocument();
    const parent = document.createElement("main");

    expect(() =>
      mountTemplateProgram(
        parent,
        { template: templateDefinition, bindings: null } as unknown as DOMTemplateProgram,
        createDOMTemplateAdapter(document),
      ),
    ).toThrow("binding instruction array");

    expect(parent.childNodes).toHaveLength(0);
  });

  it("exposes an empty binding set for static-only templates", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const roots = adapter.clone(
      adapter.parse(templateDefinition.markup, templateDefinition.namespace),
    );
    const instance = {
      roots,
      references: new Map<number, Node>(),
    };
    const scope = createScope(null);

    const bindings = applyTemplateBindings(scope, instance, []);

    expect(bindings.size).toBe(0);
    bindings.dispose();
    bindings.dispose();
    disposeScope(scope);
  });
});
