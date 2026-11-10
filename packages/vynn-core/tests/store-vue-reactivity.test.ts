// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { initializeAsyncContext } from "../src/context/async-context";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed } from "../src/reactivity/$computed";
import { $effect } from "../src/reactivity/$effect";
import { $state } from "../src/reactivity/$state";
import { $store } from "../src/reactivity/$store";

async function flushEffects() {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

describe("$store Vue-style reactivity", () => {
  it("tracks property reads, existence checks, and object iteration separately", async () => {
    const state = $store<{ first?: number; optional?: undefined }>({ first: 1 });
    const keys: string[][] = [];
    const existence: boolean[] = [];
    const values: number[] = [];

    const disposeKeys = $effect(() => {
      keys.push(Object.keys(state));
    });
    const disposeExistence = $effect(() => {
      existence.push("optional" in state);
    });
    const disposeValues = $effect(() => {
      values.push(state.first ?? 0);
    });

    try {
      state.optional = undefined;
      await flushEffects();

      expect(keys).toEqual([["first"], ["first", "optional"]]);
      expect(existence).toEqual([false, true]);
      expect(values).toEqual([1]);

      state.first = 2;
      await flushEffects();

      expect(keys).toEqual([["first"], ["first", "optional"]]);
      expect(values).toEqual([1, 2]);

      delete state.first;
      await flushEffects();

      expect(keys).toEqual([["first"], ["first", "optional"], ["optional"]]);
      expect(values).toEqual([1, 2, 0]);
      expect(existence).toEqual([false, true]);
    } finally {
      disposeKeys();
      disposeExistence();
      disposeValues();
    }
  });

  it("tracks hasOwnProperty calls", async () => {
    const state = $store<{ ready?: boolean }>({});
    const snapshots: boolean[] = [];

    const dispose = $effect(() => {
      snapshots.push(state.hasOwnProperty("ready"));
    });

    try {
      state.ready = undefined;
      await flushEffects();

      expect(snapshots).toEqual([false, true]);

      delete state.ready;
      await flushEffects();

      expect(snapshots).toEqual([false, true, false]);
    } finally {
      dispose();
    }
  });

  it("deeply tracks array iteration and array mutations", async () => {
    const items = $store([1, 2]);
    const snapshots: number[][] = [];

    const dispose = $effect(() => {
      snapshots.push(items.map((value) => value));
    });

    try {
      items.push(3);
      await flushEffects();

      items[0] = 4;
      await flushEffects();

      delete items[1];
      await flushEffects();

      expect(snapshots).toEqual([
        [1, 2],
        [1, 2, 3],
        [4, 2, 3],
        [4, 3],
      ]);
    } finally {
      dispose();
    }
  });

  it("does not collect array bookkeeping reads from mutating methods", async () => {
    const items = $store<number[]>([]);
    let executions = 0;

    const dispose = $effect(() => {
      executions += 1;
      items.push(executions);
    });

    try {
      await flushEffects();

      expect(executions).toBe(1);
      expect(items).toEqual([1]);
    } finally {
      dispose();
    }
  });

  it("supports raw and reactive identities in array search methods", () => {
    const item = { name: "Ada" };
    const items = $store([item]);
    const reactiveItem = items[0];

    expect(items.includes(item)).toBe(true);
    expect(items.includes(reactiveItem)).toBe(true);
    expect(items.indexOf(item)).toBe(0);
    expect(items.lastIndexOf(reactiveItem)).toBe(0);
  });

  it("tracks Map values separately from Map keys", async () => {
    const state = $store(new Map<string, { name: string }>());
    const values: string[] = [];
    const keys: string[][] = [];

    const disposeValues = $effect(() => {
      values.push([...state.values()].map((value) => value.name).join(","));
    });
    const disposeKeys = $effect(() => {
      keys.push([...state.keys()]);
    });

    try {
      state.set("user", { name: "Ada" });
      await flushEffects();

      state.set("user", { name: "Grace" });
      await flushEffects();

      expect(values).toEqual(["", "Ada", "Grace"]);
      expect(keys).toEqual([[], ["user"]]);

      state.delete("user");
      await flushEffects();

      expect(values).toEqual(["", "Ada", "Grace", ""]);
      expect(keys).toEqual([[], ["user"], []]);
    } finally {
      disposeValues();
      disposeKeys();
    }
  });

  it("tracks Set iteration and WeakMap key access", async () => {
    const values = $store(new Set<string>());
    const weak = $store(new WeakMap<object, number>());
    const key = {};
    const setSnapshots: string[][] = [];
    const weakSnapshots: Array<number | undefined> = [];

    const disposeSet = $effect(() => {
      setSnapshots.push([...values]);
    });
    const disposeWeak = $effect(() => {
      weakSnapshots.push(weak.get(key));
    });

    try {
      values.add("first");
      weak.set(key, 1);
      await flushEffects();

      values.add("second");
      weak.set(key, 2);
      await flushEffects();

      expect(setSnapshots).toEqual([[], ["first"], ["first", "second"]]);
      expect(weakSnapshots).toEqual([undefined, 1, 2]);

      values.clear();
      weak.delete(key);
      await flushEffects();

      expect(setSnapshots).toEqual([[], ["first"], ["first", "second"], []]);
      expect(weakSnapshots).toEqual([undefined, 1, 2, undefined]);
    } finally {
      disposeSet();
      disposeWeak();
    }
  });

  it("unwraps refs on object properties but keeps refs in arrays and collections", () => {
    const count = $state(1);
    const state = $store({ count });
    const items = $store([count]);
    const map = $store(new Map([["count", count]]));

    expect(state.count).toBe(1);
    state.count = 2;
    expect(count.value).toBe(2);

    expect(items[0].value).toBe(2);
    expect(map.get("count")?.value).toBe(2);
  });

  it("keeps computed refs read-only when assigned through a store property", () => {
    const count = $state(1);
    const doubled = $computed(() => count.value * 2);
    const state = $store({ doubled });

    expect(state.doubled).toBe(2);

    state.doubled = 100;

    expect(count.value).toBe(1);
    expect(state.doubled).toBe(2);
  });

  it("leaves unsupported built-ins raw", () => {
    const date = new Date(0);
    const state = $store({ date });

    expect(state.date).toBe(date);
    expect(state.date.getTime()).toBe(0);
    expect($store(date)).toBe(date);
  });

  it("keeps async snapshot reconciliation reactive for additions and removals", async () => {
    type Snapshot = {
      optional?: undefined;
    };

    const owner = createOwner(null);
    const resolvers = new Map<number, (value: Snapshot) => void>();

    let version!: { value: number };
    let store!: Snapshot;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        version = $state(0);
        store = $store(async () => {
          const currentVersion = version.value;

          return new Promise<Snapshot>((resolve) => {
            resolvers.set(currentVersion, resolve);
          });
        });
      });

      resolvers.get(0)?.({ optional: undefined });
      await Promise.resolve();

      const keys: string[][] = [];
      const existence: boolean[] = [];
      const dispose = $effect(() => {
        keys.push(Object.keys(store));
        existence.push("optional" in store);
      });

      try {
        expect(keys).toEqual([["optional"]]);
        expect(existence).toEqual([true]);

        version.value = 1;
        resolvers.get(1)?.({});
        await Promise.resolve();
        await flushEffects();

        expect(keys).toEqual([["optional"], []]);
        expect(existence).toEqual([true, false]);
      } finally {
        dispose();
      }
    } finally {
      disposeOwner(owner);
    }
  });

  it("deeply reacts to WeakMap values and tracks WeakSet membership", async () => {
    const key = {};
    const weakMap = $store(new WeakMap<object, { profile: { name: string } }>());
    const weakSet = $store(new WeakSet<object>());
    const names: string[] = [];
    const memberships: boolean[] = [];

    const disposeMap = $effect(() => {
      names.push(weakMap.get(key)?.profile.name ?? "missing");
    });
    const disposeSet = $effect(() => {
      memberships.push(weakSet.has(key));
    });

    try {
      weakMap.set(key, { profile: { name: "Ada" } });
      weakSet.add(key);
      await flushEffects();

      weakMap.get(key)!.profile.name = "Grace";
      weakSet.delete(key);
      await flushEffects();

      expect(names).toEqual(["missing", "Ada", "Grace"]);
      expect(memberships).toEqual([false, true, false]);
    } finally {
      disposeMap();
      disposeSet();
    }
  });
});
