import { describe, expect, it } from "vitest";

import { createTemplateFactory, type TemplateAdapter } from "../src/render_new/template/factory";
import type {
  TemplateDefinition,
  TemplateNamespace,
  TemplateReferenceKind,
} from "../src/render_new/template/types";

interface FakeNode {
  readonly kind: TemplateReferenceKind;
  readonly value: string;
  readonly children: FakeNode[];
}

interface FakeBlueprint {
  readonly roots: readonly FakeNode[];
}

function node(
  kind: TemplateReferenceKind,
  value: string,
  children: FakeNode[] = [],
): FakeNode {
  return { kind, value, children };
}

function cloneNode(source: FakeNode): FakeNode {
  return node(
    source.kind,
    source.value,
    source.children.map(cloneNode),
  );
}

function createFakeAdapter() {
  let parseCalls = 0;
  let cloneCalls = 0;

  const adapter: TemplateAdapter<FakeBlueprint, FakeNode> = {
    parse(_markup: string, _namespace: TemplateNamespace) {
      parseCalls++;

      return {
        roots: [
          node("element", "main", [
            node("text", "label"),
            node("anchor", "slot"),
          ]),
          node("element", "aside"),
        ],
      };
    },

    clone(blueprint) {
      cloneCalls++;
      return blueprint.roots.map(cloneNode);
    },

    getChild(parent, index) {
      return parent.children[index];
    },

    getKind(target) {
      return target.kind;
    },
  };

  return {
    adapter,
    get parseCalls() {
      return parseCalls;
    },
    get cloneCalls() {
      return cloneCalls;
    },
  };
}

function createDefinition(): TemplateDefinition {
  return {
    markup: "<main>label<!--slot--></main><aside></aside>",
    namespace: "html",
    references: [
      { id: 0, kind: "element", path: [0] },
      { id: 1, kind: "text", path: [0, 0] },
      { id: 2, kind: "anchor", path: [0, 1] },
      { id: 3, kind: "element", path: [1] },
    ],
  };
}

describe("render_new template factory", () => {
  it("parses one blueprint per definition and adapter pair", () => {
    const definition = createDefinition();
    const host = createFakeAdapter();

    const first = createTemplateFactory(definition, host.adapter);
    const second = createTemplateFactory(definition, host.adapter);

    expect(second).toBe(first);
    expect(host.parseCalls).toBe(1);
  });

  it("creates independent instances with resolved references", () => {
    const host = createFakeAdapter();
    const factory = createTemplateFactory(createDefinition(), host.adapter);

    const first = factory.instantiate();
    const second = factory.instantiate();

    expect(host.cloneCalls).toBe(2);
    expect(first.roots).toHaveLength(2);
    expect(first.references.get(0)).toBe(first.roots[0]);
    expect(first.references.get(1)).toBe(first.roots[0].children[0]);
    expect(first.references.get(2)).toBe(first.roots[0].children[1]);
    expect(first.references.get(3)).toBe(first.roots[1]);

    expect(second.roots[0]).not.toBe(first.roots[0]);
    expect(second.references.get(1)).not.toBe(first.references.get(1));
  });

  it("snapshots and freezes the template definition", () => {
    const definition = createDefinition();
    const host = createFakeAdapter();
    const factory = createTemplateFactory(definition, host.adapter);

    expect(factory.definition).not.toBe(definition);
    expect(Object.isFrozen(factory.definition)).toBe(true);
    expect(Object.isFrozen(factory.definition.references)).toBe(true);
    expect(Object.isFrozen(factory.definition.references[0].path)).toBe(true);
  });

  it("uses separate cached blueprints for different adapters", () => {
    const definition = createDefinition();
    const firstHost = createFakeAdapter();
    const secondHost = createFakeAdapter();

    const first = createTemplateFactory(definition, firstHost.adapter);
    const second = createTemplateFactory(definition, secondHost.adapter);

    expect(second).not.toBe(first);
    expect(firstHost.parseCalls).toBe(1);
    expect(secondHost.parseCalls).toBe(1);
  });

  it("rebuilds a cached blueprint when a mutable definition changes", () => {
    const definition = createDefinition() as {
      markup: string;
      namespace: TemplateNamespace;
      references: Array<{
        id: number;
        kind: TemplateReferenceKind;
        path: number[];
      }>;
    };
    const host = createFakeAdapter();

    const first = createTemplateFactory(definition, host.adapter);
    definition.markup = "<section></section>";
    const second = createTemplateFactory(definition, host.adapter);

    expect(second).not.toBe(first);
    expect(host.parseCalls).toBe(2);
    expect(first.definition.markup).not.toBe(second.definition.markup);
  });

  it("rejects duplicate reference IDs", () => {
    const definition: TemplateDefinition = {
      markup: "<div></div>",
      namespace: "html",
      references: [
        { id: 0, kind: "element", path: [0] },
        { id: 0, kind: "element", path: [0] },
      ],
    };

    expect(() => createTemplateFactory(definition, createFakeAdapter().adapter))
      .toThrow("Duplicate template reference ID 0");
  });

  it("rejects empty and invalid reference paths", () => {
    const host = createFakeAdapter();

    expect(() =>
      createTemplateFactory({
        markup: "<div></div>",
        namespace: "html",
        references: [{ id: 0, kind: "element", path: [] }],
      }, host.adapter),
    ).toThrow("must have a non-empty node path");

    expect(() =>
      createTemplateFactory({
        markup: "<div></div>",
        namespace: "html",
        references: [{ id: 0, kind: "element", path: [0, -1] }],
      }, host.adapter),
    ).toThrow("invalid path index");
  });

  it("rejects references that resolve to a missing node", () => {
    const host = createFakeAdapter();
    const factory = createTemplateFactory({
      markup: "<main></main>",
      namespace: "html",
      references: [{ id: 1, kind: "element", path: [2] }],
    }, host.adapter);

    expect(() => factory.instantiate()).toThrow(
      "points to a missing node at path [2]",
    );
  });

  it("rejects references whose resolved node kind does not match", () => {
    const host = createFakeAdapter();
    const factory = createTemplateFactory({
      markup: "<main></main>",
      namespace: "html",
      references: [{ id: 7, kind: "text", path: [0] }],
    }, host.adapter);

    expect(() => factory.instantiate()).toThrow(
      "expected a text node but resolved to element",
    );
  });
});
