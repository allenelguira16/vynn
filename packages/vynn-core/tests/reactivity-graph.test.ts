import { describe, expect, it, vi } from "vitest";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed, type Computed } from "../src/reactivity/computed";
import { createAbortControllerSlot, settleAsync } from "../src/reactivity/async/resource";
import { allocateAsyncResourceID, withAsyncResourceScope } from "../src/runtime/async/runtime";
import { $effect, $renderEffect } from "../src/reactivity/effect";
import { batch, supportsAsyncTracking, transaction, untrack } from "../src/reactivity/graph";
import { isPending } from "../src/reactivity/async/pending";
import { $state } from "../src/reactivity/state";
import { $store } from "../src/reactivity/store";
import { PendingReadError } from "../src/reactivity/async/pending-error";
import { NotReadyError } from "../src/reactivity/async/not-ready-error";
import { enterAsyncBoundary } from "../src/context/async-boundary";
import { enterErrorBoundary } from "../src/context/error-boundary";

const tick = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("new reactive graph", () => {
  it("indexes async resources in runtime scopes without allocating Owners", () => {
    const owner = createOwner(null);
    let first = "";
    let second = "";
    let nested = "";
    let child = "";

    runWithOwner(owner, () => {
      first = allocateAsyncResourceID()!;
      second = allocateAsyncResourceID()!;
      nested = withAsyncResourceScope(first, () => allocateAsyncResourceID()!);

      const componentOwner = createOwner();
      runWithOwner(componentOwner, () => {
        child = allocateAsyncResourceID()!;
      });
    });

    expect(first).toBe("0:0");
    expect(second).toBe("0:1");
    expect(nested).toBe("0:0:0");
    expect(child).toBe("00:0");
    expect(owner.children).toHaveLength(1);
    expect(owner.children[0]?.id).toBe("00");
    expect(owner.nodeCount).toBe(1);

    disposeOwner(owner);
  });

  it("shares abort-controller ownership across async graph runs", () => {
    const controllers = createAbortControllerSlot();
    const first = controllers.start(true)!;
    const second = controllers.start(true)!;

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    controllers.abortRun(second);
    expect(second.signal.aborted).toBe(true);
  });

  it("ignores stale async settlements", async () => {
    const resolve = vi.fn();
    const reject = vi.fn();

    await settleAsync({
      promise: Promise.resolve(1),
      isCurrent: () => false,
      resolve,
      reject,
    });

    await settleAsync({
      promise: Promise.reject(new Error("stale")),
      isCurrent: () => false,
      resolve,
      reject,
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it("settles an async value only while its run is current", async () => {
    const resolve = vi.fn();
    const reject = vi.fn();

    await settleAsync({
      promise: Promise.resolve(7),
      isCurrent: () => true,
      resolve,
      reject,
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(7);
    expect(reject).not.toHaveBeenCalled();
  });

  it("evaluates synchronous computed values and propagates changes", () => {
    const count = $state(1);
    const getter = vi.fn(() => count.value * 2);
    const doubled = $computed(getter);

    expect(getter).toHaveBeenCalledTimes(1);
    expect(doubled.value).toBe(2);

    count.value = 4;

    expect(getter).toHaveBeenCalledTimes(2);
    expect(doubled.value).toBe(8);
  });

  it("updates chained computed values before running downstream effects", () => {
    const count = $state(1);
    const doubled = $computed(() => count.value * 2);
    const quadrupled = $computed(() => doubled.value * 2);
    const values: number[] = [];
    const stop = $effect(() => { values.push(quadrupled.value); });

    count.value = 3;

    expect(values).toEqual([4, 12]);
    stop();
  });

  it("reconciles conditional dependencies", () => {
    const chooseA = $state(true);
    const a = $state("A");
    const b = $state("B");
    const selected = $computed(() => chooseA.value ? a.value : b.value);

    expect(selected.value).toBe("A");
    chooseA.value = false;
    expect(selected.value).toBe("B");

    a.value = "unused";
    expect(selected.value).toBe("B");

    b.value = "updated";
    expect(selected.value).toBe("updated");
  });

  it("batches multiple source changes into one effect run", () => {
    const first = $state(0);
    const second = $state(0);
    const snapshots: number[][] = [];
    const stop = $effect(() => { snapshots.push([first.value, second.value]); });

    batch(() => {
      first.value = 1;
      second.value = 2;
      first.value = 3;
    });

    expect(snapshots).toEqual([[0, 0], [3, 2]]);
    stop();
  });

  it("defers self-invalidations until an effect has installed its cleanup", () => {
    const state = $state(0);
    const values: number[] = [];
    const cleanups: number[] = [];

    const stop = $effect(() => {
      const current = state.value;
      values.push(current);
      if (current === 0) state.value = 1;
      return () => { cleanups.push(current); };
    });

    expect(values).toEqual([0, 1]);
    expect(cleanups).toEqual([0]);

    stop();
    expect(cleanups).toEqual([0, 1]);
  });

  it("reruns effects and makes disposal idempotent", () => {
    const state = $state(0);
    const callback = vi.fn(() => {
      state.value;
    });
    const stop = $effect(callback);

    state.value++;
    expect(callback).toHaveBeenCalledTimes(2);

    stop();
    stop();
    state.value++;

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("runs effect cleanup before reruns and on disposal", () => {
    const state = $state(0);
    const cleanup = vi.fn();
    const stop = $effect(() => {
      state.value;
      return cleanup;
    });

    state.value++;
    expect(cleanup).toHaveBeenCalledTimes(1);

    stop();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("does not rerun an effect when its final cleanup writes a dependency", () => {
    const state = $state(0);
    let runs = 0;
    const stop = $effect(() => {
      state.value;
      runs++;
      return () => { state.value++; };
    });

    stop();

    expect(state.value).toBe(1);
    expect(runs).toBe(1);
  });

  it("resolves async state and makes pending transitions reactive", async () => {
    let resolve!: (value: string) => void;
    const state = $state(() => new Promise<string>(r => resolve = r));
    const snapshots: boolean[] = [];
    const stop = $effect(() => { snapshots.push(isPending(state)); });

    expect(isPending(state)).toBe(true);
    expect(() => state.value).toThrow(PendingReadError);
    expect(snapshots).toEqual([true]);

    resolve("ready");
    await tick();

    expect(state.value).toBe("ready");
    expect(isPending(state)).toBe(false);
    expect(snapshots).toEqual([true, false]);

    stop();
  });

  it("surfaces async state rejection and allows a later value to recover", async () => {
    let reject!: (cause: unknown) => void;
    const state = $state(() => new Promise<number>((_, r) => reject = r));
    const error = new Error("state failed");

    reject(error);
    await tick();

    expect(isPending(state)).toBe(false);
    expect(() => state.value).toThrow(error);

    state.value = 7;
    expect(state.value).toBe(7);
  });

  it("lets an explicit state write replace a pending initializer", async () => {
    let resolve!: (value: number) => void;
    const state = $state(() => new Promise<number>(r => resolve = r));

    state.value = 5;
    expect(state.value).toBe(5);
    expect(isPending(state)).toBe(false);

    resolve(9);
    await tick();

    expect(state.value).toBe(5);
  });

  it("eagerly starts async computed work and updates pending state", async () => {
    let resolve!: (value: number) => void;
    const getter = vi.fn(() => new Promise<number>(r => resolve = r));
    const result = $computed(getter);

    expect(getter).toHaveBeenCalledTimes(1);
    expect(isPending(result)).toBe(true);

    resolve(42);
    await tick();

    expect(result.value).toBe(42);
    expect(isPending(result)).toBe(false);
  });

  it("ignores stale async computed settlements", async () => {
    const source = $state(1);
    const resolvers: Array<(value: number) => void> = [];
    const result = $computed<number>(() => {
      const current = source.value;
      return new Promise<number>(resolve => resolvers.push(resolveWith(resolve, current * 100)));
    });

    expect(resolvers).toHaveLength(1);
    source.value = 2;
    expect(resolvers).toHaveLength(2);

    resolvers[1](200);
    await tick();
    resolvers[0](100);
    await tick();

    expect(result.value).toBe(200);
    expect(isPending(result)).toBe(false);
  });

  it("propagates pending reads through synchronous computed dependencies", async () => {
    let resolve!: (value: number) => void;
    const dependency = $computed(() => new Promise<number>(r => resolve = r));
    const derived = $computed(() => dependency.value + 1);

    expect(isPending(derived)).toBe(true);
    expect(() => derived.value).toThrow(PendingReadError);

    resolve(41);
    await tick();

    expect(derived.value).toBe(42);
    expect(isPending(derived)).toBe(false);
  });

  it("propagates pending reads from an async getter before its first await", async () => {
    let resolve!: (value: number) => void;
    const dependency = $computed(() => new Promise<number>(r => resolve = r));
    const derived = $computed(async () => {
      const value = dependency.value;
      await Promise.resolve();
      return value + 1;
    });

    expect(isPending(derived)).toBe(true);
    expect(() => derived.value).toThrow(PendingReadError);

    resolve(8);
    await tick();

    expect(derived.value).toBe(9);
    expect(isPending(derived)).toBe(false);
  });

  it("does not collect dependencies first read after await", async () => {
    let resume!: () => void;
    const gate = new Promise<void>(resolve => resume = resolve);
    const source = $state(1);
    const result = $computed(async () => {
      await gate;
      return source.value;
    });

    source.value = 2;
    resume();
    await tick();

    expect(result.value).toBe(2);

    source.value = 3;
    expect(result.value).toBe(2);
  });

  it("surfaces async computed errors and recovers after invalidation", async () => {
    const shouldFail = $state(true);
    const result = $computed(() => {
      if (shouldFail.value) return Promise.reject(new Error("computed failed"));
      return Promise.resolve(12);
    });

    await tick();
    expect(isPending(result)).toBe(false);
    expect(() => result.value).toThrow("computed failed");

    shouldFail.value = false;
    await tick();
    expect(result.value).toBe(12);
  });

  it("runs derived computations before effects that also read their sources", () => {
    const count = $state(1);
    const doubled = $computed(() => count.value * 2);
    const snapshots: number[][] = [];
    const stop = $effect(() => { snapshots.push([count.value, doubled.value]); });

    count.value = 2;

    expect(snapshots).toEqual([[1, 2], [2, 4]]);
    stop();
  });

  it("surfaces circular computed dependencies", () => {
    const recurse = $state(false);
    let result!: Computed<number>;
    result = $computed(() => recurse.value ? result.value : 1);

    expect(result.value).toBe(1);
    recurse.value = true;
    expect(() => result.value).toThrow("Circular computed dependency");
  });

  it("assimilates PromiseLike values", async () => {
    const thenable = {
      then(resolve: (value: number) => void) {
        resolve(9);
      },
    } as unknown as PromiseLike<number>;
    const result = $computed(() => thenable);

    await tick();
    expect(result.value).toBe(9);
  });

  it("skips downstream work when a computed value stays equal", () => {
    const count = $state(1);
    const parity = $computed(() => count.value % 2);
    let runs = 0;
    const stop = $effect(() => { parity.value; runs++; });

    count.value = 3;
    expect(runs).toBe(1);
    count.value = 4;
    expect(runs).toBe(2);
    stop();
  });

  it("supports explicit computed equality policies", () => {
    const count = $state(1);
    const parity = $computed(() => count.value % 2, { equals: false });
    let runs = 0;
    const stop = $effect(() => { parity.value; runs++; });

    count.value = 3;
    expect(runs).toBe(2);
    stop();
  });

  it("supports lazy computed initialization", () => {
    const count = $state(1);
    let evaluations = 0;
    const doubled = $computed(() => {
      evaluations++;
      return count.value * 2;
    }, { lazy: true });

    expect(evaluations).toBe(0);
    expect(doubled.value).toBe(2);
    expect(evaluations).toBe(1);

    count.value = 2;
    expect(doubled.value).toBe(4);
    expect(evaluations).toBe(2);
  });

  it("supports untracked reads without subscribing the active effect", () => {
    const count = $state(1);
    let runs = 0;
    const stop = $effect(() => {
      runs++;
      untrack(() => count.value);
    });

    count.value = 2;
    expect(runs).toBe(1);
    stop();
  });

  it("tracks nested object properties and preserves nested proxy identity", () => {
    const store = $store({ user: { name: "Ada" } });
    const user = store.user;
    const names: string[] = [];
    const stop = $effect(() => { names.push(store.user.name); });

    store.user.name = "Grace";

    expect(store.user).toBe(user);
    expect(names).toEqual(["Ada", "Grace"]);
    stop();
  });

  it("tracks object additions, deletions, and key iteration", () => {
    const store = $store<{ first?: number; second?: number }>({ first: 1 });
    const snapshots: string[] = [];
    const stop = $effect(() => {
      snapshots.push(Object.keys(store).sort().join(","));
    });

    store.second = 2;
    delete store.first;

    expect(snapshots).toEqual(["first", "first,second", "second"]);
    stop();
  });

  it("tracks property existence independently from property values", () => {
    const store = $store<{ value?: number }>({});
    const snapshots: boolean[] = [];
    const stop = $effect(() => { snapshots.push("value" in store); });

    store.value = 1;
    delete store.value;

    expect(snapshots).toEqual([false, true, false]);
    stop();
  });

  it("tracks array iteration and batches mutating methods", () => {
    const store = $store({ values: [1, 2] });
    const snapshots: string[] = [];
    const stop = $effect(() => { snapshots.push(store.values.join(",")); });

    store.values.push(3);
    store.values.splice(0, 1);

    expect(snapshots).toEqual(["1,2", "1,2,3", "2,3"]);
    stop();
  });

  it("unwraps object refs and forwards assignments to writable refs", () => {
    const count = $state(1);
    const store = $store({ count });
    const snapshots: number[] = [];
    const stop = $effect(() => { snapshots.push(store.count); });

    store.count = 2;

    expect(count.value).toBe(2);
    expect(snapshots).toEqual([1, 2]);
    stop();
  });

  it("keeps refs in array slots wrapped", () => {
    const count = $state(1);
    const store = $store({ values: [count] });

    expect(store.values[0]).toBe(count);
    expect(store.values[0].value).toBe(1);
  });

  it("tracks Map key reads, size, and key iteration", () => {
    const store = $store(new Map([["first", 1]]));
    const values: number[] = [];
    const sizes: number[] = [];
    const keys: string[][] = [];
    const entries: number[] = [];

    const stopValue = $effect(() => { values.push(store.get("first") ?? 0); });
    const stopSize = $effect(() => { sizes.push(store.size); });
    const stopKeys = $effect(() => { keys.push([...store.keys()].sort()); });
    const stopEntries = $effect(() => { entries.push([...store.values()].reduce((sum, value) => sum + value, 0)); });

    store.set("first", 2);
    store.set("second", 3);
    store.delete("first");

    expect(values).toEqual([1, 2, 0]);
    expect(sizes).toEqual([1, 2, 1]);
    expect(keys).toEqual([["first"], ["first", "second"], ["second"]]);
    expect(entries).toEqual([1, 2, 5, 3]);

    stopValue();
    stopSize();
    stopKeys();
    stopEntries();
  });

  it("tracks Set membership and iteration", () => {
    const store = $store(new Set(["first"]));
    const membership: boolean[] = [];
    const sizes: number[] = [];
    const stopMembership = $effect(() => { membership.push(store.has("second")); });
    const stopSize = $effect(() => { sizes.push(store.size); });

    store.add("second");
    store.delete("first");

    expect(membership).toEqual([false, true]);
    expect(sizes).toEqual([1, 2, 1]);

    stopMembership();
    stopSize();
  });

  it("initializes async stores in place and exposes pending state", async () => {
    let resolve!: (value: { user: { name: string } }) => void;
    const store = $store(() => new Promise<{ user: { name: string } }>(r => resolve = r));

    expect(isPending(store)).toBe(true);
    expect(() => store.user).toThrow(PendingReadError);

    resolve({ user: { name: "Ada" } });
    await tick();

    expect(isPending(store)).toBe(false);
    expect(store.user.name).toBe("Ada");

    store.user.name = "Grace";
    expect(store.user.name).toBe("Grace");
  });

  it("surfaces async store initializer failures on store reads", async () => {
    let reject!: (cause: unknown) => void;
    const store = $store(() => new Promise<{ value: number }>((_, r) => reject = r));
    const failure = new Error("store failed");

    reject(failure);
    await tick();

    expect(isPending(store)).toBe(false);
    expect(() => store.value).toThrow(failure);
  });


  it("does not rerun array key iteration for value-only changes", () => {
    const store = $store([1, 2]);
    const keys: string[] = [];
    const stop = $effect(() => { keys.push(Object.keys(store).join(",")); });

    store[0] = 10;
    expect(keys).toEqual(["0,1"]);

    store.push(3);
    expect(keys).toEqual(["0,1", "0,1,2"]);

    delete store[1];
    expect(keys).toEqual(["0,1", "0,1,2", "0,2"]);
    stop();
  });

  it("tracks structural changes made with Object.defineProperty", () => {
    const store = $store<{ value?: number }>({});
    const keys: string[] = [];
    const stop = $effect(() => { keys.push(Object.keys(store).join(",")); });

    Object.defineProperty(store, "value", {
      value: 2,
      enumerable: true,
      configurable: true,
      writable: true,
    });

    expect(keys).toEqual(["", "value"]);
    stop();
  });



  it("automatically disposes effects with their Vynn owner", () => {
    const owner = createOwner(null);
    const count = $state(0);
    let runs = 0;

    runWithOwner(owner, () => {
      $effect(() => {
        count.value;
        runs++;
      });
    });

    expect(runs).toBe(1);
    count.value = 1;
    expect(runs).toBe(2);

    disposeOwner(owner);
    count.value = 2;
    expect(runs).toBe(2);
  });

  it("automatically disposes computed subscriptions with their Vynn owner", () => {
    const owner = createOwner(null);
    const count = $state(1);
    let evaluations = 0;
    let doubled!: Computed<number>;

    runWithOwner(owner, () => {
      doubled = $computed(() => {
        evaluations++;
        return count.value * 2;
      });
    });

    expect(doubled.value).toBe(2);
    expect(evaluations).toBe(1);

    disposeOwner(owner);
    count.value = 2;

    expect(evaluations).toBe(1);
    expect(doubled.value).toBe(2);
  });



  it("does not retain stale dependencies while running effect cleanup", () => {
    const chooseA = $state(true);
    const a = $state(0);
    const b = $state(0);
    let runs = 0;

    const stop = $effect(() => {
      runs++;
      if (chooseA.value) {
        a.value;
        return () => { a.value++; };
      }
      b.value;
    });

    chooseA.value = false;
    expect(runs).toBe(2);
    expect(a.value).toBe(1);

    a.value++;
    expect(runs).toBe(2);

    b.value++;
    expect(runs).toBe(3);
    stop();
  });

  it("does not evaluate a lazy computed after its owner is disposed", () => {
    const owner = createOwner(null);
    const count = $state(1);
    let evaluations = 0;
    let doubled!: Computed<number>;

    runWithOwner(owner, () => {
      doubled = $computed(() => {
        evaluations++;
        return count.value * 2;
      }, { lazy: true });
    });

    disposeOwner(owner);
    expect(() => doubled.value).toThrow("disposed before initialization");
    expect(evaluations).toBe(0);
  });



  it("silently clears pending state when an owner disposes an async computed", async () => {
    const owner = createOwner(null);
    let resolve!: (value: number) => void;
    let result!: Computed<number>;

    runWithOwner(owner, () => {
      result = $computed(() => new Promise<number>(r => resolve = r));
    });

    expect(isPending(result)).toBe(true);
    disposeOwner(owner);
    expect(isPending(result)).toBe(false);

    resolve(12);
    await tick();

    expect(() => result.value).toThrow("disposed before initialization");
  });

  it("supports transaction as the batch alias", () => {
    const first = $state(0);
    const second = $state(0);
    const snapshots: number[][] = [];
    const stop = $effect(() => { snapshots.push([first.value, second.value]); });

    transaction(() => {
      first.value = 1;
      second.value = 1;
    });

    expect(snapshots).toEqual([[0, 0], [1, 1]]);
    stop();
  });


  it.skipIf(!supportsAsyncTracking())("tracks dependencies first read after await when AsyncContext is available", async () => {
    const source = $state(1);
    const derived = $computed(async () => {
      await Promise.resolve();
      return source.value;
    });

    let pending!: Promise<unknown>;
    try {
      derived.value;
    } catch (error) {
      pending = (error as PendingReadError).promise;
    }
    await pending;
    expect(derived.value).toBe(1);

    source.value = 2;

    try {
      derived.value;
    } catch (error) {
      pending = (error as PendingReadError).promise;
    }
    await pending;
    expect(derived.value).toBe(2);
  });

  it("keeps component-created owners in the component identity tree", () => {
    const owner = createOwner(null);

    runWithOwner(owner, () => {
      $computed(() => {
        createOwner();
        return new Promise<number>(() => {});
      });
    });

    const sibling = createOwner(owner);

    expect(sibling.id).toBe("01");
    disposeOwner(owner);
  });

  it("allocates component identities independently of computed async transitions", () => {
    const owner = createOwner(null);
    const enabled = $state(false);

    runWithOwner(owner, () => {
      $computed(() => {
        if (!enabled.value) return 0;
        createOwner();
        return new Promise<number>(() => {});
      });
    });

    enabled.value = true;
    const sibling = createOwner(owner);

    expect(sibling.id).toBe("01");
    disposeOwner(owner);
  });

  it("does not allocate child Owners for async state or computed resources", () => {
    const owner = createOwner(null);

    runWithOwner(owner, () => {
      $state(() => Promise.resolve(1));
      $computed(() => Promise.resolve(2));
    });

    expect(owner.children).toEqual([]);
    expect(owner.nodeCount).toBe(0);
    disposeOwner(owner);
  });

  it("does not consume hydration owner IDs for synchronous state or computed values", () => {
    const owner = createOwner(null);

    const nextOwner = runWithOwner(owner, () => {
      $state(() => 1);
      $computed(() => 2);
      return createOwner(owner);
    });

    expect(nextOwner.id).toBe("00");
    disposeOwner(owner);
  });

  it("retries a state initializer after a pending dependency resolves", async () => {
    let resolveDependency!: (value: number) => void;
    const dependency = $state(
      () => new Promise<number>(resolve => {
        resolveDependency = resolve;
      }),
    );
    const derived = $state(() => dependency.value + 1);

    let pendingPromise: Promise<unknown> | undefined;
    expect(() => derived.value).toThrow(NotReadyError);
    try {
      derived.value;
    } catch (error) {
      pendingPromise = (error as NotReadyError).promise;
    }

    expect(pendingPromise).toBeDefined();
    expect(isPending(derived)).toBe(true);

    resolveDependency(4);
    await pendingPromise;

    expect(derived.value).toBe(5);
    expect(isPending(derived)).toBe(false);
  });

  it("aborts a previous async computed run when dependencies change", () => {
    const source = $state(0);
    const signals: AbortSignal[] = [];
    const resolvers: Array<(value: number) => void> = [];
    const result = $computed<number>(signal => {
      source.value;
      signals.push(signal);
      return new Promise<number>(resolve => resolvers.push(resolve));
    });

    source.value = 1;

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    resolvers[1](2);
    resolvers[0](1);
  });

  it("aborts an async state initializer when manually replaced", () => {
    let signal!: AbortSignal;
    const state = $state<number>(currentSignal => {
      signal = currentSignal;
      return new Promise<number>(() => {});
    });

    state.value = 7;

    expect(signal.aborted).toBe(true);
    expect(state.value).toBe(7);
  });

  it("aborts async state initializers when their owner is disposed", () => {
    const owner = createOwner(null);
    let signal!: AbortSignal;

    runWithOwner(owner, () => {
      $state<number>(currentSignal => {
        signal = currentSignal;
        return new Promise<number>(() => {});
      });
    });

    disposeOwner(owner);
    expect(signal.aborted).toBe(true);
  });

  it("runs renderer effects synchronously before normal effects", async () => {
    const state = $state(0);
    const order: string[] = [];
    const stopRender = $renderEffect(() => {
      order.push(`render:${state.value}`);
    });
    const stopEffect = $effect(() => {
      order.push(`effect:${state.value}`);
    });

    state.value = 1;

    expect(order).toEqual(["render:0", "effect:0", "render:1"]);
    await tick();
    expect(order).toEqual(["render:0", "effect:0", "render:1", "effect:1"]);
    stopRender();
    stopEffect();
  });

  it("bridges pending reads to the active Await boundary", () => {
    const owner = createOwner(null);
    let resolve!: (value: number) => void;
    let registered: Promise<unknown> | undefined;

    runWithOwner(owner, () => {
      enterAsyncBoundary(promise => {
        registered = promise;
      });
      const state = $state(() => new Promise<number>(r => resolve = r));

      expect(() => state.value).toThrow(NotReadyError);
    });

    expect(registered).toBeDefined();
    resolve(3);
    disposeOwner(owner);
  });

  it("routes effect errors through the owning error boundary", () => {
    const owner = createOwner(null);
    const state = $state(false);
    const errors: Error[] = [];
    let stop!: () => void;

    runWithOwner(owner, () => {
      enterErrorBoundary(error => errors.push(error));
      stop = $effect(() => {
        if (state.value) throw new Error("effect failed");
      });
    });

    state.value = true;

    expect(errors.map(error => error.message)).toEqual(["effect failed"]);
    stop();
    disposeOwner(owner);
  });

});

function resolveWith(
  resolve: (value: number) => void,
  value: number,
): (value: number) => void {
  return () => resolve(value);
}
