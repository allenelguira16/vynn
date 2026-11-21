import { describe, expect, it } from "vitest";

import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed } from "../src/reactivity/computed";
import { $effect } from "../src/reactivity/effect";
import { $state } from "../src/reactivity/state";

async function flushEffects(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("reactive graph", () => {
  it("keeps synchronous state initializers as one-time snapshots", async () => {
    const source = $state(2);
    let executions = 0;

    const snapshot = $state(() => {
      executions++;
      return source.value * 10;
    });

    expect(snapshot.value).toBe(20);
    expect(executions).toBe(1);

    source.value = 3;
    await flushEffects();

    expect(snapshot.value).toBe(20);
    expect(executions).toBe(1);
  });

  it("replaces a computed node's dependencies after conditional reads", async () => {
    const left = $state(1);
    const right = $state(2);
    const useLeft = $state(true);
    const selected = $computed(() => (useLeft.value ? left.value : right.value));
    const values: number[] = [];

    const stop = $effect(() => {
      values.push(selected.value);
    });

    expect(values).toEqual([1]);

    left.value = 3;
    await flushEffects();
    expect(values).toEqual([1, 3]);

    useLeft.value = false;
    await flushEffects();
    expect(values).toEqual([1, 3, 2]);

    left.value = 4;
    await flushEffects();
    expect(values).toEqual([1, 3, 2]);

    right.value = 5;
    await flushEffects();
    expect(values).toEqual([1, 3, 2, 5]);

    stop();
  });

  it("cleans computed subscriptions when their owner is disposed", () => {
    const owner = createOwner();
    const source = $state(1);
    let executions = 0;
    let derived!: { readonly value: number };

    runWithOwner(owner, () => {
      derived = $computed(() => {
        executions++;
        return source.value * 2;
      });
    });

    expect(derived.value).toBe(2);
    expect(executions).toBe(1);

    disposeOwner(owner);
    source.value = 2;

    expect(derived.value).toBe(2);
    expect(executions).toBe(1);
  });
});
