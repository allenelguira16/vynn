// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { ASYNC_DATA_SSR_KEY } from "../src/const";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed, type Computed } from "../src/reactivity/computed";
import { getPendingPromise, isPending } from "../src/reactivity/async/pending";
import { $state, type State } from "../src/reactivity/state";
import { allocateAsyncResourceID, withAsyncResourceScope } from "../src/runtime/async/runtime";
import { initializeAsyncHydrationRuntime } from "../src/runtime/async/hydration";

const globalWindow = window as unknown as Record<string, unknown>;
const hadPreviousPayload = Object.prototype.hasOwnProperty.call(globalWindow, ASYNC_DATA_SSR_KEY);
const previousPayload = globalWindow[ASYNC_DATA_SSR_KEY];

afterEach(() => {
  if (hadPreviousPayload) {
    globalWindow[ASYNC_DATA_SSR_KEY] = previousPayload;
  } else {
    delete globalWindow[ASYNC_DATA_SSR_KEY];
  }
});

describe("runtime-owned async resources", () => {
  it("assigns stable nested slots without allocating child Owners", () => {
    const owner = createOwner(null);
    let first = "";
    let second = "";
    let nestedFirst = "";
    let nestedSecond = "";

    try {
      runWithOwner(owner, () => {
        first = allocateAsyncResourceID()!;
        second = allocateAsyncResourceID()!;

        nestedFirst = withAsyncResourceScope(first, () => allocateAsyncResourceID()!);
        nestedSecond = withAsyncResourceScope(first, () => allocateAsyncResourceID()!);
      });

      expect(first).toBe("00");
      expect(second).toBe("01");
      expect(nestedFirst).toBe("000");
      expect(nestedSecond).toBe("000");
      expect(owner.children).toEqual([]);
      expect(owner.nodeCount).toBe(2);
    } finally {
      disposeOwner(owner);
    }
  });


  it("shares identity slots with child Owners without allocating resource Owners", () => {
    const owner = createOwner(null);
    let resourceBefore = "";
    let childOwner: ReturnType<typeof createOwner> | undefined;
    let resourceAfter = "";

    try {
      runWithOwner(owner, () => {
        resourceBefore = allocateAsyncResourceID()!;
        childOwner = createOwner();
        resourceAfter = allocateAsyncResourceID()!;
      });

      expect(resourceBefore).toBe("00");
      expect(childOwner?.id).toBe("01");
      expect(resourceAfter).toBe("02");
      expect(owner.nodeCount).toBe(3);
      expect(owner.children).toEqual([childOwner]);
    } finally {
      disposeOwner(owner);
    }
  });

  it("isolates resource indexes between render roots", () => {
    const firstRoot = createOwner(null);
    const secondRoot = createOwner(null);

    try {
      const firstID = runWithOwner(firstRoot, () => allocateAsyncResourceID());
      const secondID = runWithOwner(secondRoot, () => allocateAsyncResourceID());

      expect(firstID).toBe("00");
      expect(secondID).toBe("00");
    } finally {
      disposeOwner(firstRoot);
      disposeOwner(secondRoot);
    }
  });

  it("hydrates one-shot state values and recreates nested resource slots", () => {
    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "00": 42,
      "000": 7,
    };

    const owner = createOwner(null);
    let parentRuns = 0;
    let childRuns = 0;
    let parent!: State<number>;
    let child!: State<number>;

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();

        parent = $state(async () => {
          parentRuns++;
          child = $state(async () => {
            childRuns++;
            return 99;
          });
          await Promise.resolve();
          return 100;
        });

        expect(parent.value).toBe(42);
        expect(child.value).toBe(7);
        expect(isPending(parent)).toBe(false);
        expect(isPending(child)).toBe(false);
        expect(parentRuns).toBe(1);
        expect(childRuns).toBe(1);
        expect(owner.children).toEqual([]);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("hydrates computed values while retaining their synchronous dependencies", async () => {
    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "00": 10,
    };

    const owner = createOwner(null);
    let source!: State<number>;
    let derived!: Computed<number>;

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();

        source = $state(4);
        derived = $computed(async () => {
          const value = source.value;
          await Promise.resolve();
          return value * 2;
        });

        expect(derived.value).toBe(10);
        expect(isPending(derived)).toBe(false);

        source.value = 6;
        expect(isPending(derived)).toBe(true);
      });

      const pending = getPendingPromise(derived);
      expect(pending).toBeDefined();
      await pending;

      runWithOwner(owner, () => {
        expect(derived.value).toBe(12);
        expect(isPending(derived)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });
  it("does not probe initializers without a hydrated resource value", async () => {
    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "01": 42,
    };

    const owner = createOwner(null);
    let firstRuns = 0;
    let secondRuns = 0;
    let first!: State<number>;
    let second!: State<number>;

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();

        first = $state(() => {
          firstRuns++;
          return Promise.resolve(10);
        });

        second = $state(() => {
          secondRuns++;
          return Promise.resolve(42);
        });

        expect(isPending(first)).toBe(true);
        expect(firstRuns).toBe(1);
        expect(second.value).toBe(42);
        expect(secondRuns).toBe(1);
        expect(isPending(second)).toBe(false);
      });

      await Promise.resolve();

      runWithOwner(owner, () => {
        expect(first.value).toBe(10);
      });
    } finally {
      disposeOwner(owner);
    }
  });

});
