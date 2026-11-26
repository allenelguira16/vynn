import { describe, expect, it } from "vitest";

import {
  resolveTemplateReference,
  resolveTemplateReferences,
  type TemplateNodeResolver,
} from "../src/render_new/template/resolve";
import type {
  TemplateReference,
  TemplateReferenceKind,
} from "../src/render_new/template/types";

interface FakeNode {
  readonly kind: TemplateReferenceKind;
  readonly value: string;
  readonly children: FakeNode[];
}

function node(
  kind: TemplateReferenceKind,
  value: string,
  children: FakeNode[] = [],
): FakeNode {
  return { kind, value, children };
}

function createRoots(): FakeNode[] {
  return [
    node("element", "main", [
      node("text", "heading"),
      node("anchor", "content"),
    ]),
    node("element", "aside"),
  ];
}

const resolver: TemplateNodeResolver<FakeNode> = {
  getChild(parent, index) {
    return parent.children[index];
  },
  getKind(target) {
    return target.kind;
  },
};

function reference(
  id: number,
  kind: TemplateReferenceKind,
  path: number[],
): TemplateReference {
  return { id, kind, path };
}

describe("render_new template reference resolver", () => {
  it("resolves root and nested references using child-node positions", () => {
    const roots = createRoots();

    expect(resolveTemplateReference(roots, reference(0, "element", [0]), resolver))
      .toBe(roots[0]);
    expect(resolveTemplateReference(roots, reference(1, "text", [0, 0]), resolver))
      .toBe(roots[0].children[0]);
    expect(resolveTemplateReference(roots, reference(2, "anchor", [0, 1]), resolver))
      .toBe(roots[0].children[1]);
    expect(resolveTemplateReference(roots, reference(3, "element", [1]), resolver))
      .toBe(roots[1]);
  });

  it("returns all resolved nodes keyed by their compiler reference IDs", () => {
    const roots = createRoots();
    const resolved = resolveTemplateReferences(
      roots,
      [
        reference(12, "anchor", [0, 1]),
        reference(4, "element", [1]),
        reference(8, "text", [0, 0]),
      ],
      resolver,
    );

    expect([...resolved.keys()]).toEqual([12, 4, 8]);
    expect(resolved.get(12)).toBe(roots[0].children[1]);
    expect(resolved.get(4)).toBe(roots[1]);
    expect(resolved.get(8)).toBe(roots[0].children[0]);
  });

  it("reports a missing root node", () => {
    expect(() =>
      resolveTemplateReference(
        createRoots(),
        reference(5, "element", [4]),
        resolver,
      ),
    ).toThrow("Template reference 5 points to a missing node at path [4]");
  });

  it("reports a missing nested node", () => {
    expect(() =>
      resolveTemplateReference(
        createRoots(),
        reference(6, "text", [0, 3]),
        resolver,
      ),
    ).toThrow("Template reference 6 points to a missing node at path [0, 3]");
  });

  it("rejects references whose resolved node kind does not match", () => {
    expect(() =>
      resolveTemplateReference(
        createRoots(),
        reference(7, "text", [1]),
        resolver,
      ),
    ).toThrow("Template reference 7 expected a text node but resolved to element");
  });

  it("rejects malformed reference IDs, kinds, and paths", () => {
    const roots = createRoots();

    expect(() =>
      resolveTemplateReference(
        roots,
        { id: -1, kind: "element", path: [0] },
        resolver,
      ),
    ).toThrow("Template reference IDs must be non-negative safe integers");

    expect(() =>
      resolveTemplateReference(
        roots,
        { id: 1, kind: "comment", path: [0] } as unknown as TemplateReference,
        resolver,
      ),
    ).toThrow("Template reference 1 has an unsupported node kind");

    expect(() =>
      resolveTemplateReference(roots, reference(2, "element", []), resolver),
    ).toThrow("Template reference 2 must have a non-empty node path");

    expect(() =>
      resolveTemplateReference(roots, reference(3, "element", [0, 1.5]), resolver),
    ).toThrow("has an invalid path index at position 1");
  });

  it("rejects duplicate IDs when resolving a reference collection", () => {
    expect(() =>
      resolveTemplateReferences(
        createRoots(),
        [
          reference(0, "element", [0]),
          reference(0, "element", [1]),
        ],
        resolver,
      ),
    ).toThrow("Duplicate template reference ID 0");
  });

  it("validates the roots, references, and resolver inputs", () => {
    expect(() =>
      resolveTemplateReference(
        null as unknown as readonly FakeNode[],
        reference(0, "element", [0]),
        resolver,
      ),
    ).toThrow("expects a root node array");

    expect(() =>
      resolveTemplateReferences(
        createRoots(),
        null as unknown as readonly TemplateReference[],
        resolver,
      ),
    ).toThrow("Template references must be an array");

    expect(() =>
      resolveTemplateReference(
        createRoots(),
        reference(0, "element", [0]),
        null as unknown as TemplateNodeResolver<FakeNode>,
      ),
    ).toThrow("expects a valid node resolver");
  });

  it("propagates errors thrown by host node operations", () => {
    const failingResolver: TemplateNodeResolver<FakeNode> = {
      getChild() {
        throw new Error("host lookup failed");
      },
      getKind(target) {
        return target.kind;
      },
    };

    expect(() =>
      resolveTemplateReference(
        createRoots(),
        reference(9, "text", [0, 0]),
        failingResolver,
      ),
    ).toThrow("host lookup failed");
  });
});
