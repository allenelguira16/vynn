import { describe, expect, it } from "vitest";

import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed } from "../src/reactivity_new/computed";
import { $effect, $renderEffect, batch } from "../src/reactivity_new/effect";
import { isPending } from "../src/reactivity_new/pending";
import { $state } from "../src/reactivity_new/state";
import { $store } from "../src/reactivity_new/store";
import { NotReadyError } from "../src/reactivity_new/not-ready-error";

async function flushEffects(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("new reactivity API", () => {
  it("requires function initializers for state and store", () => {
    expect(() => $state(0 as never)).toThrow(/requires an initializer function/);
    expect(() => $store({} as never)).toThrow(/requires an initializer function/);
  });

  it("does not attach SSR blocking policy to NotReadyError", () => {
    const error = new NotReadyError(Promise.resolve());

    expect(error).not.toHaveProperty("blocking");
  });

  it("initializes writable state from a function", () => {
    const count = $state(() => 1);

    expect(count.value).toBe(1);

    count.value = 2;
    expect(count.value).toBe(2);
  });

  it("tracks state dependencies in effects", async () => {
    const count = $state(() => 0);
    const values: number[] = [];

    const stop = $effect(() => {
      values.push(count.value);
    });

    count.value = 1;
    count.value = 2;
    await flushEffects();

    expect(values).toEqual([0, 2]);
    stop();
  });

  it("runs render effects synchronously and batches repeated writes", () => {
    const count = $state(() => 0);
    const values: number[] = [];

    const stop = $renderEffect(() => {
      values.push(count.value);
    });

    batch(() => {
      count.value = 1;
      count.value = 2;
      count.value = 3;
    });

    expect(values).toEqual([0, 3]);
    stop();
  });

  it("derives values and invalidates consumers when dependencies change", async () => {
    const count = $state(() => 2);
    const doubled = $computed(() => count.value * 2);
    const values: number[] = [];

    const stop = $effect(() => {
      values.push(doubled.value);
    });

    expect(doubled.value).toBe(4);

    count.value = 4;
    await flushEffects();

    expect(doubled.value).toBe(8);
    expect(values).toEqual([4, 8]);
    stop();
  });

  it("evaluates synchronous computed getters eagerly", () => {
    let getterRuns = 0;
    const value = $computed(() => {
      getterRuns++;
      return 42;
    });

    expect(getterRuns).toBe(1);
    expect(value.value).toBe(42);
    expect(getterRuns).toBe(1);
  });

  it("starts async state, store, and computed initializers eagerly in an owner", async () => {
    const owner = createOwner();
    let stateRuns = 0;
    let storeRuns = 0;
    let computedRuns = 0;

    const values = runWithOwner(owner, () => ({
      state: $state(async () => {
        stateRuns++;
        return 42;
      }),
      store: $store(async () => {
        storeRuns++;
        return { count: 1 };
      }),
      computed: $computed(async () => {
        computedRuns++;
        return 84;
      }),
    }));

    expect([stateRuns, storeRuns, computedRuns]).toEqual([1, 1, 1]);

    await flushEffects();

    expect(values.state.value).toBe(42);
    expect(values.store.count).toBe(1);
    expect(values.computed.value).toBe(84);

    disposeOwner(owner);
  });

  it("suspends computed values when an async dependency refreshes", async () => {
    const url = $state(() => "/first");
    const resolvers = new Map<string, () => void>();

    const state = $state(async () => {
      const requestedUrl = url.value;
      await new Promise<void>((resolve) => {
        resolvers.set(requestedUrl, resolve);
      });
      return requestedUrl;
    });
    const computed = $computed(() => state.value.toUpperCase());

    let initialPromise: Promise<unknown> | undefined;
    try {
      computed.value;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      initialPromise = (error as NotReadyError).promise;
    }

    expect(initialPromise).toBeDefined();
    expect(isPending(state)).toBe(true);
    expect(isPending(computed)).toBe(true);

    resolvers.get("/first")?.();
    await initialPromise;

    expect(computed.value).toBe("/FIRST");
    expect(isPending(state)).toBe(false);
    expect(isPending(computed)).toBe(false);

    url.value = "/second";

    expect(isPending(state)).toBe(true);
    expect(isPending(computed)).toBe(true);

    let refreshPromise: Promise<unknown> | undefined;
    try {
      computed.value;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      refreshPromise = (error as NotReadyError).promise;
    }

    expect(refreshPromise).toBeDefined();

    resolvers.get("/second")?.();
    await refreshPromise;

    expect(computed.value).toBe("/SECOND");
    expect(isPending(state)).toBe(false);
    expect(isPending(computed)).toBe(false);
  });

  it("reacts to nested object changes, additions, deletion and iteration", async () => {
    const state = $store<{
      profile: { name: string };
      enabled?: boolean;
      extra?: string;
    }>(() => ({
      profile: { name: "Ada" },
      enabled: true,
    }));
    const names: string[] = [];
    const keys: string[][] = [];

    const stopName = $effect(() => {
      names.push(state.profile.name);
    });
    const stopKeys = $effect(() => {
      keys.push(Object.keys(state));
    });

    state.profile.name = "Grace";
    state.extra = "compiler";
    delete state.enabled;
    await flushEffects();

    expect(names).toEqual(["Ada", "Grace"]);
    expect(keys).toEqual([["profile", "enabled"], ["profile", "enabled", "extra"], ["profile", "extra"]]);

    stopName();
    stopKeys();
  });

  it("tracks Map entries with arbitrary keys", async () => {
    const objectKey = {};
    const store = $store(() => ({
      values: new Map<unknown, string>([
        [objectKey, "initial"],
        [undefined, "optional"],
      ]),
    }));
    const snapshots: string[] = [];

    const stop = $effect(() => {
      snapshots.push(
        `${store.values.get(objectKey) ?? "missing"}|${store.values.get(undefined) ?? "missing"}`,
      );
    });

    store.values.set(objectKey, "updated");
    store.values.delete(undefined);
    await flushEffects();

    expect(snapshots).toEqual(["initial|optional", "updated|missing"]);
    stop();
  });

  it("tracks Set membership with arbitrary values", async () => {
    const objectValue = {};
    const store = $store(() => ({ values: new Set<unknown>() }));
    const snapshots: boolean[] = [];

    const stop = $effect(() => {
      snapshots.push(store.values.has(objectValue));
    });

    store.values.add(objectValue);
    await flushEffects();

    expect(snapshots).toEqual([false, true]);
    stop();
  });

  it("unwraps writable refs when assigning through a store", () => {
    const count = $state(() => 1);
    const store = $store(() => ({ count }));

    store.count = 2;

    expect(count.value).toBe(2);
    expect(store.count).toBe(2);
  });

  it("keeps async state pending until its initializer resolves", async () => {
    const state = $state(async () => 42);

    let pendingPromise: Promise<unknown> | undefined;
    try {
      state.value;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      pendingPromise = (error as NotReadyError).promise;
    }

    expect(pendingPromise).toBeDefined();
    expect(isPending(state)).toBe(true);

    await pendingPromise;

    expect(state.value).toBe(42);
    expect(isPending(state)).toBe(false);
  });

  it("reconciles an async store into a stable reactive object", async () => {
    const store = $store(async () => ({ count: 1, profile: { name: "Ada" } }));

    let pendingPromise: Promise<unknown> | undefined;
    try {
      store.count;
    } catch (error) {
      pendingPromise = (error as NotReadyError).promise;
    }

    expect(pendingPromise).toBeDefined();
    await pendingPromise;

    expect(store.count).toBe(1);
    expect(store.profile.name).toBe("Ada");

    store.count = 2;
    expect(store.count).toBe(2);
  });

  it("suspends async store reads while a refresh is pending", async () => {
    const url = $state(() => "/first");
    const resolvers = new Map<string, () => void>();

    const store = $store(async () => {
      const requestedUrl = url.value;

      await new Promise<void>((resolve) => {
        resolvers.set(requestedUrl, resolve);
      });

      const names =
        requestedUrl === "/first"
          ? ["Bulbasaur", "Ivysaur"]
          : ["Charmander", "Charmeleon"];

      return {
        results: names.map((name) => ({ name, url: requestedUrl })),
      };
    });

    // Activate the ownerless resource and let its initial request resolve.
    try {
      store.results;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
    }

    expect(resolvers.has("/first")).toBe(true);
    resolvers.get("/first")?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(store.results.map((item) => item.name)).toEqual(["Bulbasaur", "Ivysaur"]);

    // Local sorting updates the current store snapshot. A later successful
    // refresh reconciles the new server response into the same root store.
    store.results = [...store.results].reverse();
    expect(store.results.map((item) => item.name)).toEqual(["Ivysaur", "Bulbasaur"]);

    // The resource no longer exposes its previous snapshot while refreshing.
    url.value = "/second";
    expect(isPending(store)).toBe(true);

    let refreshPromise: Promise<unknown> | undefined;
    try {
      store.results;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      refreshPromise = (error as NotReadyError).promise;
    }

    expect(refreshPromise).toBeDefined();
    resolvers.get("/second")?.();
    await refreshPromise;

    expect(store.results.map((item) => item.name)).toEqual(["Charmander", "Charmeleon"]);
    expect(isPending(store)).toBe(false);
  });

  it("updates mapped consumers when an async store refreshes from a state dependency", async () => {
    const url = $state(() => "/first");
    const resolvers = new Map<string, () => void>();

    const store = $store(async () => {
      const requestedUrl = url.value;

      await new Promise<void>((resolve) => {
        resolvers.set(requestedUrl, resolve);
      });

      return {
        results: [{ name: requestedUrl, url: requestedUrl }],
      };
    });

    const renderedRows: string[] = [];
    const stop = $renderEffect(() => {
      renderedRows.push(
        store.results.map(({ name, url: resultUrl }, index) =>
          `${index}:${name}:${resultUrl}`,
        ).join(","),
      );
    });

    expect(isPending(store)).toBe(true);

    resolvers.get("/first")?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(renderedRows.at(-1)).toBe("0:/first:/first");
    expect(isPending(store)).toBe(false);

    url.value = "/second";
    expect(isPending(store)).toBe(true);

    resolvers.get("/second")?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(renderedRows.at(-1)).toBe("0:/second:/second");
    expect(isPending(store)).toBe(false);

    stop();
  });

  it("disposes effects with their owner", async () => {
    const owner = createOwner();
    const count = $state(() => 0);
    const values: number[] = [];

    runWithOwner(owner, () => {
      $effect(() => {
        values.push(count.value);
      });
    });

    count.value = 1;
    await flushEffects();
    disposeOwner(owner);
    count.value = 2;
    await flushEffects();

    expect(values).toEqual([0, 1]);
  });
});
