import { describe, expect, it } from "vitest";

import {
  getOwnerContext,
  modifyOwnerContext,
  setOwnerContext,
} from "../src/context/owner-context";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import {
  createRuntimeContext,
  runWithRuntimeContext,
  runWithRuntimeContextRoot,
} from "../src/runtime/context";

describe("Owner context", () => {
  it("inherits values and resolves the nearest Owner definition", () => {
    const key = Symbol("owner-context-inheritance");
    const root = createOwner(null);
    const route = createOwner(root);
    const child = createOwner(route);
    const sibling = createOwner(root);

    try {
      runWithOwner(root, () => setOwnerContext(key, "root"));
      runWithOwner(route, () => setOwnerContext(key, "route"));

      runWithOwner(child, () => {
        expect(getOwnerContext(key)).toBe("route");
      });
      runWithOwner(sibling, () => {
        expect(getOwnerContext(key)).toBe("root");
      });
    } finally {
      disposeOwner(root);
    }
  });

  it("updates the nearest defining Owner without creating a child override", () => {
    const key = Symbol("owner-context-update");
    const root = createOwner(null);
    const child = createOwner(root);

    try {
      runWithOwner(root, () => setOwnerContext(key, 1));
      runWithOwner(child, () => {
        expect(modifyOwnerContext<number>(key, (value) => value + 1)).toBe(true);
        expect(getOwnerContext(key)).toBe(2);
      });
      runWithOwner(root, () => {
        expect(getOwnerContext(key)).toBe(2);
      });
    } finally {
      disposeOwner(root);
    }
  });

  it("survives RuntimeContext frame changes", () => {
    const key = Symbol("owner-context-runtime-isolation");
    const root = createOwner(null);
    const child = createOwner(root);

    try {
      runWithRuntimeContext(createRuntimeContext(null), () => {
        runWithOwner(root, () => setOwnerContext(key, "owned by root"));
      });

      runWithRuntimeContextRoot(() => {
        runWithOwner(child, () => {
          expect(getOwnerContext(key)).toBe("owned by root");
        });
      });
    } finally {
      disposeOwner(root);
    }
  });
});
