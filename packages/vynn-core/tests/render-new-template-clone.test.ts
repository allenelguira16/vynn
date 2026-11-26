import { describe, expect, it } from "vitest";

import {
  cloneTemplateInstance,
  type TemplateNodeCloner,
} from "../src/render_new/template/clone";
import type { TemplateNodeResolver } from "../src/render_new/template/resolve";
import type {
  TemplateReference,
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
  return node(source.kind, source.value, source.children.map(cloneNode));
}

function createBlueprint(): FakeBlueprint {
  return {
    roots: [
      node("element", "main", [
        node("text", "heading"),
        node("anchor", "children"),
      ]),
      node("element", "footer"),
    ],
  };
}

const resolver: TemplateNodeResolver<FakeNode> = {
  getChild(parent, index) {
    return parent.children[index];
  },
  getKind(target) {
    return target.kind;
  },
};

const references: readonly TemplateReference[] = [
  { id: 1, kind: "element", path: [0] },
  { id: 2, kind: "text", path: [0, 0] },
  { id: 3, kind: "anchor", path: [0, 1] },
  { id: 4, kind: "element", path: [1] },
];

function createCloner() {
  let calls = 0;
  const cloner: TemplateNodeCloner<FakeBlueprint, FakeNode> = {
    clone(blueprint) {
      calls++;
      return blueprint.roots.map(cloneNode);
    },
  };

  return {
    cloner,
    get calls() {
      return calls;
    },
  };
}

describe("render_new template cloning boundary", () => {
  it("clones fresh roots and resolves references against the cloned nodes", () => {
    const blueprint = createBlueprint();
    const cloner = createCloner();

    const first = cloneTemplateInstance(blueprint, cloner.cloner, references, resolver);
    const second = cloneTemplateInstance(blueprint, cloner.cloner, references, resolver);

    expect(cloner.calls).toBe(2);
    expect(first.roots).toHaveLength(2);
    expect(first.references.get(1)).toBe(first.roots[0]);
    expect(first.references.get(2)).toBe(first.roots[0].children[0]);
    expect(first.references.get(3)).toBe(first.roots[0].children[1]);
    expect(first.references.get(4)).toBe(first.roots[1]);

    expect(second.roots[0]).not.toBe(first.roots[0]);
    expect(second.references.get(2)).not.toBe(first.references.get(2));
    expect(first.roots[0]).not.toBe(blueprint.roots[0]);
  });

  it("copies and freezes the returned root array without freezing host nodes", () => {
    const blueprint = createBlueprint();
    const clonedRoots = blueprint.roots.map(cloneNode);
    const cloner: TemplateNodeCloner<FakeBlueprint, FakeNode> = {
      clone() {
        return clonedRoots;
      },
    };

    const instance = cloneTemplateInstance(blueprint, cloner, [], resolver);

    expect(instance.roots).not.toBe(clonedRoots);
    expect(instance.roots).toEqual(clonedRoots);
    expect(Object.isFrozen(instance.roots)).toBe(true);
    expect(Object.isFrozen(instance.roots[0])).toBe(false);
  });

  it("provides a runtime-immutable reference table", () => {
    const instance = cloneTemplateInstance(
      createBlueprint(),
      createCloner().cloner,
      references,
      resolver,
    );

    expect(instance.references.get(2)?.value).toBe("heading");
    expect(instance.references.has(4)).toBe(true);
    expect(instance.references.size).toBe(4);
    expect([...instance.references.keys()]).toEqual([1, 2, 3, 4]);
    expect([...instance.references.values()]).toHaveLength(4);
    expect([...instance.references]).toHaveLength(4);
    expect("set" in instance.references).toBe(false);
    expect("delete" in instance.references).toBe(false);
    expect("clear" in instance.references).toBe(false);

    const visited: number[] = [];
    instance.references.forEach((_value, key, map) => {
      expect(map).toBe(instance.references);
      visited.push(key);
    });

    expect(visited).toEqual([1, 2, 3, 4]);
    expect(Object.isFrozen(instance)).toBe(true);
    expect(Object.isFrozen(instance.references)).toBe(true);
  });

  it("rejects a cloner that does not return an array", () => {
    const cloner = {
      clone: () => null,
    } as unknown as TemplateNodeCloner<FakeBlueprint, FakeNode>;

    expect(() =>
      cloneTemplateInstance(createBlueprint(), cloner, [], resolver),
    ).toThrow("A template cloner must return an array of root nodes");
  });

  it("rejects nullish entries in the returned root list", () => {
    const cloner = {
      clone: () => [node("element", "main"), null],
    } as unknown as TemplateNodeCloner<FakeBlueprint, FakeNode>;

    expect(() =>
      cloneTemplateInstance(createBlueprint(), cloner, [], resolver),
    ).toThrow("returned an empty root at index 1");
  });

  it("rejects the same object root appearing more than once", () => {
    const sharedRoot = node("element", "main");
    const cloner: TemplateNodeCloner<FakeBlueprint, FakeNode> = {
      clone: () => [sharedRoot, sharedRoot],
    };

    expect(() =>
      cloneTemplateInstance(createBlueprint(), cloner, [], resolver),
    ).toThrow("returned the same root node more than once");
  });

  it("allows empty templates when there are no references", () => {
    const cloner: TemplateNodeCloner<FakeBlueprint, FakeNode> = {
      clone: () => [],
    };

    const instance = cloneTemplateInstance(
      createBlueprint(),
      cloner,
      [],
      resolver,
    );

    expect(instance.roots).toEqual([]);
    expect(instance.references.size).toBe(0);
  });

  it("rejects a missing reference target after cloning", () => {
    const cloner = createCloner();

    expect(() =>
      cloneTemplateInstance(
        createBlueprint(),
        cloner.cloner,
        [{ id: 11, kind: "element", path: [9] }],
        resolver,
      ),
    ).toThrow("Template reference 11 points to a missing node");
    expect(cloner.calls).toBe(1);
  });

  it("rejects invalid reference collections before cloning", () => {
    const cloner = createCloner();

    expect(() =>
      cloneTemplateInstance(
        createBlueprint(),
        cloner.cloner,
        null as unknown as readonly TemplateReference[],
        resolver,
      ),
    ).toThrow("Template instantiation expects a reference array");
    expect(cloner.calls).toBe(0);
  });

  it("propagates errors thrown by the host cloner", () => {
    const cloner: TemplateNodeCloner<FakeBlueprint, FakeNode> = {
      clone() {
        throw new Error("clone failed");
      },
    };

    expect(() =>
      cloneTemplateInstance(createBlueprint(), cloner, [], resolver),
    ).toThrow("clone failed");
  });
});
