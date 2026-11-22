import { describe, expect, it } from "vitest";

import { createOwner, disposeOwner, getOwner, runWithOwner } from "../src/life-cycle/owner";
import { $effect } from "../src/reactivity/effect";
import { getLazyID, initializeLazyContext } from "../src/context/lazy-context";

import "../src/runtime/server/context";
import {
  bindRuntimeContext,
  createRuntimeContext,
  getContext,
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

  it("restores inherited runtime context when an owner is re-entered after async work", () => {
    const appOwner = createOwner(null);
    let routeOwner!: ReturnType<typeof createOwner>;

    runWithRuntimeContextRoot(() => {
      runWithOwner(appOwner, () => {
        initializeLazyContext();
        routeOwner = createOwner();
      });
    });

    // Simulate a route preload Promise callback: the original root runtime
    // frame has exited, but re-entering the route owner must restore its
    // inherited lazy-ID registry.
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
