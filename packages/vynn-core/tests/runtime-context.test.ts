import { describe, expect, it } from "vitest";

import { createOwner, disposeOwner, getOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed, type Computed } from "../src/reactivity/computed";
import { $effect } from "../src/reactivity/effect";
import { $state } from "../src/reactivity/state";
import { getLazyID, initializeLazyContext } from "../src/context/lazy-context";

import "../src/runtime/server/context";
import "../src/life-cycle/server-context";
import {
  bindRuntimeContext,
  createRuntimeContext,
  getContext,
  getRuntimeContext,
  runWithRuntimeContext,
  runWithRuntimeContextRoot,
  runWithRuntimeContextScope,
  setContext,
} from "../src/runtime/context";

describe("runtime context storage", () => {
  it("inherits values through nested frames without mutating the parent", () => {
    const key = Symbol("runtime-context-test");
    const root = createRuntimeContext(null);

    runWithRuntimeContext(root, () => {
      setContext(key, "root");

      runWithRuntimeContextScope(() => {
        expect(getContext(key)).toBe("root");
        setContext(key, "child");
        expect(getContext(key)).toBe("child");
      });

      expect(getContext(key)).toBe("root");
    });

    expect(getContext(key)).toBeUndefined();
  });

  it("isolates fresh root frames from their parent", () => {
    const key = Symbol("runtime-context-root");
    const parent = createRuntimeContext(null);

    runWithRuntimeContext(parent, () => {
      setContext(key, "parent");

      runWithRuntimeContextRoot(() => {
        expect(getContext(key)).toBeUndefined();
        setContext(key, "root");
        expect(getContext(key)).toBe("root");
      });

      expect(getContext(key)).toBe("parent");
    });
  });

  it("retains captured context for callbacks invoked after the frame exits", () => {
    const key = Symbol("runtime-context-bound");
    let invoke!: () => string | undefined;

    runWithRuntimeContext(createRuntimeContext(null), () => {
      setContext(key, "captured");
      invoke = bindRuntimeContext(() => getContext<string>(key));
    });

    expect(invoke()).toBe("captured");
    expect(getContext(key)).toBeUndefined();
  });

  it("isolates concurrent async runtime contexts", async () => {
    const key = Symbol("runtime-context-concurrency");

    const run = (value: string, delay: number) =>
      runWithRuntimeContext(createRuntimeContext(null), async () => {
        setContext(key, value);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return getContext(key);
      });

    await expect(Promise.all([run("first", 10), run("second", 1)])).resolves.toEqual([
      "first",
      "second",
    ]);
  });

  it("retains the creating runtime context when effects rerun", async () => {
    const key = Symbol("runtime-context-effect-rerun");
    const owner = createOwner(null);
    const state = $state(0);
    let observed: string | undefined;

    runWithRuntimeContext(createRuntimeContext(null), () => {
      setContext(key, "captured");
      runWithOwner(owner, () => {
        $effect(() => {
          state.value;
          observed = getContext<string>(key);
        });
      });
    });

    state.value = 1;
    await Promise.resolve();

    expect(observed).toBe("captured");
    disposeOwner(owner);
  });

  it("retains the creating runtime context when computed values recompute", () => {
    const key = Symbol("runtime-context-computed-rerun");
    const owner = createOwner(null);
    const state = $state(1);
    let value!: Computed<number>;

    runWithRuntimeContext(createRuntimeContext(null), () => {
      setContext(key, "captured");
      runWithOwner(owner, () => {
        value = $computed(() =>
          state.value + (getContext<string>(key) === "captured" ? 10 : 0),
        );
      });
    });

    state.value = 2;

    expect(value.value).toBe(12);
    disposeOwner(owner);
  });

  it("retains the creating runtime context for effect cleanup callbacks", () => {
    const key = Symbol("runtime-context-effect-cleanup");
    const owner = createOwner(null);
    let observed: string | undefined;

    runWithRuntimeContext(createRuntimeContext(null), () => {
      setContext(key, "captured");
      runWithOwner(owner, () => {
        $effect(() => () => {
          observed = getContext<string>(key);
        });
      });
    });

    disposeOwner(owner);
    expect(observed).toBe("captured");
  });

  it("keeps Owner-scoped lazy context available after the runtime frame exits", () => {
    const appOwner = createOwner(null);
    let routeOwner!: ReturnType<typeof createOwner>;

    runWithRuntimeContextRoot(() => {
      runWithOwner(appOwner, () => {
        initializeLazyContext();
        routeOwner = createOwner();
      });
    });

    // Lazy IDs live in the Owner hierarchy, not RuntimeContext. Re-entering
    // the route owner after the original runtime frame exits must still find
    // the inherited lazy-ID registry.
    let lazyID = "";
    runWithOwner(routeOwner, () => {
      const lazyOwner = createOwner();
      runWithOwner(lazyOwner, () => {
        lazyID = getLazyID();
      });
    });

    expect(lazyID).toBe("0");
    disposeOwner(appOwner);
  });

  it("keeps Owner execution independent from RuntimeContext frames", () => {
    const owner = createOwner(null);

    runWithRuntimeContextRoot(() => {
      runWithOwner(owner, () => {
        expect(getOwner()).toBe(owner);
        expect("currentOwner" in getRuntimeContext()).toBe(false);

        runWithRuntimeContextScope(() => {
          expect(getOwner()).toBe(owner);
          expect("currentOwner" in getRuntimeContext()).toBe(false);
        });

        expect(getOwner()).toBe(owner);
      });
    });

    disposeOwner(owner);
  });

  it("does not change RuntimeContext when the active Owner changes", () => {
    const key = Symbol("owner-runtime-context-independence");
    const owner = createOwner(null);
    const runtimeContext = createRuntimeContext(null);

    runWithRuntimeContext(runtimeContext, () => {
      setContext(key, "runtime-value");

      runWithOwner(owner, () => {
        runWithOwner(null, () => {
          expect(getOwner()).toBeNull();
          expect(getRuntimeContext()).toBe(runtimeContext);
          expect(getContext<string>(key)).toBe("runtime-value");
        });

        expect(getOwner()).toBe(owner);
        expect(getRuntimeContext()).toBe(runtimeContext);
      });
    });

    disposeOwner(owner);
  });

  it("restores the parent Owner after a nested activation", () => {
    const parent = createOwner(null);
    const child = createOwner(parent);

    runWithOwner(parent, () => {
      expect(getOwner()).toBe(parent);

      runWithOwner(child, () => {
        expect(getOwner()).toBe(child);
      });

      expect(getOwner()).toBe(parent);
    });

    expect(getOwner()).toBeNull();
    disposeOwner(parent);
  });

  it("propagates Owner and RuntimeContext through independent async stores", async () => {
    const key = Symbol("independent-execution-stores");
    const firstOwner = createOwner(null);
    const secondOwner = createOwner(null);

    const run = (owner: ReturnType<typeof createOwner>, value: string, delay: number) =>
      runWithRuntimeContext(createRuntimeContext(null), async () => {
        setContext(key, value);

        await runWithOwner(owner, async () => {
          expect(getOwner()).toBe(owner);
          await new Promise((resolve) => setTimeout(resolve, delay));
          expect(getOwner()).toBe(owner);
          expect(getContext<string>(key)).toBe(value);
          expect("currentOwner" in getRuntimeContext()).toBe(false);
        });

        expect(getOwner()).toBeNull();
        expect(getContext<string>(key)).toBe(value);
      });

    await Promise.all([
      run(firstOwner, "first", 10),
      run(secondOwner, "second", 1),
    ]);

    disposeOwner(firstOwner);
    disposeOwner(secondOwner);
  });

  it("keeps the active Owner isolated across concurrent async scopes", async () => {
    const firstOwner = createOwner(null);
    const secondOwner = createOwner(null);

    const run = (owner: ReturnType<typeof createOwner>, delay: number) =>
      runWithOwner(owner, async () => {
        expect(getOwner()).toBe(owner);
        await new Promise((resolve) => setTimeout(resolve, delay));
        expect(getOwner()).toBe(owner);
      });

    await Promise.all([run(firstOwner, 10), run(secondOwner, 1)]);
  });
});
