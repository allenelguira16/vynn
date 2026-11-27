// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { ASYNC_DATA_SSR_KEY } from "../src/const";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed, type Computed } from "../src/reactivity/computed";
import { getPendingPromise, isPending } from "../src/reactivity/async/pending";
import { $state, type State } from "../src/reactivity/state";
import { $store } from "../src/reactivity/store";
import {
  allocateAsyncResourceID,
  allocateAsyncResourceIDFor,
  withAsyncResourceScope,
} from "../src/runtime/async/runtime";
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

      expect(first).toBe("0.");
      expect(second).toBe("01");
      expect(nestedFirst).toBe("0..");
      expect(nestedSecond).toBe("0..");
      expect(owner.children).toBeUndefined();
      expect(owner.nodeCount).toBe(2);
    } finally {
      disposeOwner(owner);
    }
  });


  it("allocates stable IDs for owner-independent resources per render root", () => {
    const resource = {};
    const firstRoot = createOwner(null);
    const secondRoot = createOwner(null);
    let firstID = "";
    let repeatedID = "";
    let secondID = "";

    try {
      firstID = runWithOwner(firstRoot, () => allocateAsyncResourceIDFor(resource)!);
      repeatedID = runWithOwner(firstRoot, () => allocateAsyncResourceIDFor(resource)!);
      secondID = runWithOwner(secondRoot, () => allocateAsyncResourceIDFor(resource)!);

      expect(firstID).toBe("0.");
      expect(repeatedID).toBe(firstID);
      expect(secondID).toBe("0.");
      expect(firstRoot.nodeCount).toBe(1);
      expect(secondRoot.nodeCount).toBe(1);
      expect(firstRoot.children).toBeUndefined();
      expect(secondRoot.children).toBeUndefined();
    } finally {
      disposeOwner(firstRoot);
      disposeOwner(secondRoot);
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

      expect(resourceBefore).toBe("0.");
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

      expect(firstID).toBe("0.");
      expect(secondID).toBe("0.");
    } finally {
      disposeOwner(firstRoot);
      disposeOwner(secondRoot);
    }
  });

  it("hydrates one-shot state values and recreates nested resource slots", () => {
    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "0.": 42,
      "0..": 7,
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
        expect(owner.children).toBeUndefined();
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("hydrates computed values while retaining their synchronous dependencies", async () => {
    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "0.": 10,
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

  it("hydrates an ownerless async state when its value is first read", async () => {
    let resolve!: (value: number) => void;
    let signal!: AbortSignal;
    const state = $state<number>(currentSignal => {
      signal = currentSignal;
      return new Promise<number>(r => resolve = r);
    });

    globalWindow[ASYNC_DATA_SSR_KEY] = { "0.": 42 };
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();
        expect(state.value).toBe(42);
        expect(isPending(state)).toBe(false);
      });

      expect(signal.aborted).toBe(true);
      disposeOwner(owner);

      // The pre-hydration request is stale and cannot replace the server value.
      resolve(100);
      await Promise.resolve();
      await Promise.resolve();

      expect(state.value).toBe(42);
    } finally {
      disposeOwner(owner);
    }
  });

  it("hydrates an ownerless async computed when its value is first read", async () => {
    let resolve!: (value: number) => void;
    let signal!: AbortSignal;
    const value = $computed<number>(currentSignal => {
      signal = currentSignal;
      return new Promise<number>(r => resolve = r);
    });

    globalWindow[ASYNC_DATA_SSR_KEY] = { "0.": 73 };
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();
        expect(value.value).toBe(73);
        expect(isPending(value)).toBe(false);
      });

      expect(signal.aborted).toBe(true);
      disposeOwner(owner);

      resolve(99);
      await Promise.resolve();
      await Promise.resolve();

      expect(value.value).toBe(73);
    } finally {
      disposeOwner(owner);
    }
  });


  it("hydrates an ownerless async state when isPending is the first read", () => {
    let resolve!: (value: number) => void;
    let signal!: AbortSignal;
    const state = $state<number>(currentSignal => {
      signal = currentSignal;
      return new Promise<number>(r => resolve = r);
    });

    globalWindow[ASYNC_DATA_SSR_KEY] = { "0.": 42 };
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();
        expect(isPending(state)).toBe(false);
        expect(state.value).toBe(42);
      });

      expect(signal.aborted).toBe(true);
      resolve(100);
    } finally {
      disposeOwner(owner);
    }
  });

  it("hydrates an ownerless async computed when isPending is the first read", () => {
    let resolve!: (value: number) => void;
    let signal!: AbortSignal;
    const value = $computed<number>(currentSignal => {
      signal = currentSignal;
      return new Promise<number>(r => resolve = r);
    });

    globalWindow[ASYNC_DATA_SSR_KEY] = { "0.": 73 };
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();
        expect(isPending(value)).toBe(false);
        expect(value.value).toBe(73);
      });

      expect(signal.aborted).toBe(true);
      resolve(99);
    } finally {
      disposeOwner(owner);
    }
  });

  it("hydrates an ownerless async store when isPending is the first read", () => {
    let resolve!: (value: { count: number }) => void;
    let signal!: AbortSignal;
    const store = $store<{ count: number }>(currentSignal => {
      signal = currentSignal;
      return new Promise<{ count: number }>(r => resolve = r);
    });

    globalWindow[ASYNC_DATA_SSR_KEY] = { "0.": { count: 1351 } };
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();
        expect(isPending(store)).toBe(false);
        expect(store.count).toBe(1351);
      });

      expect(signal.aborted).toBe(true);
      resolve({ count: 999 });
    } finally {
      disposeOwner(owner);
    }
  });


  it("hydrates an ownerless async store read inside a derived computation", async () => {
    let resolve!: (value: { results: { name: string }[] }) => void;
    let signal!: AbortSignal;
    const store = $store<{ results: { name: string }[] }>(currentSignal => {
      signal = currentSignal;
      return new Promise<{ results: { name: string }[] }>(r => resolve = r);
    });

    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "0.": { results: [{ name: "bulbasaur" }, { name: "ivysaur" }] },
    };
    const owner = createOwner(null);
    let names!: Computed<string[]>;

    try {
      runWithOwner(owner, () => {
        initializeAsyncHydrationRuntime();
        names = $computed(() => store.results.map(item => item.name));
        expect(names.value).toEqual(["bulbasaur", "ivysaur"]);
        expect(isPending(store)).toBe(false);
      });

      expect(signal.aborted).toBe(true);
      resolve({ results: [{ name: "client-value" }] });
      await Promise.resolve();
      await Promise.resolve();
      expect(names.value).toEqual(["bulbasaur", "ivysaur"]);
    } finally {
      disposeOwner(owner);
    }
  });


});
