import { describe, expect, it } from "vitest";

import {
  cleanup,
  createComputation,
  execute,
  node,
  track,
} from "../src/reactivity/graph";


describe("compact reactive graph links", () => {
  it("stores a computation's common single dependency without a Set", () => {
    const source = node();
    const computation = createComputation(() => {});

    execute(computation, () => track(source));

    expect(computation.dependencies).toBe(source);
    expect(source.firstObserver).toBe(computation);
    expect(source.secondObserver).toBeNull();
    expect(source.observers).toBeUndefined();

    computation.dispose();

    expect(computation.dependencies).toBeUndefined();
    expect(source.firstObserver).toBeNull();
    expect(source.secondObserver).toBeNull();
  });

  it("stores the common two observers inline and collapses after cleanup", () => {
    const source = node();
    const first = createComputation(() => {});
    const second = createComputation(() => {});

    execute(first, () => track(source));
    execute(second, () => track(source));

    expect(source.firstObserver).toBe(first);
    expect(source.secondObserver).toBe(second);
    expect(source.observers).toBeUndefined();

    second.dispose();

    expect(source.firstObserver).toBe(first);
    expect(source.secondObserver).toBeNull();
    expect(source.observers).toBeUndefined();

    first.dispose();
  });

  it("promotes to a Set only for three or more observers", () => {
    const source = node();
    const first = createComputation(() => {});
    const second = createComputation(() => {});
    const third = createComputation(() => {});

    execute(first, () => track(source));
    execute(second, () => track(source));
    execute(third, () => track(source));

    expect(source.observers).toBeInstanceOf(Set);
    expect(source.observers?.size).toBe(3);

    second.dispose();

    expect(source.observers).toBeUndefined();
    expect(new Set([source.firstObserver, source.secondObserver])).toEqual(
      new Set([first, third]),
    );

    first.dispose();
    third.dispose();
  });

  it("allocates a Set only when a computation tracks multiple sources", () => {
    const firstSource = node();
    const secondSource = node();
    const computation = createComputation(() => {});

    execute(computation, () => {
      track(firstSource);
      track(secondSource);
    });

    expect(computation.dependencies).toBeInstanceOf(Set);
    expect(computation.dependencies?.size).toBe(2);

    cleanup(computation);

    expect(computation.dependencies).toBeUndefined();
    expect(firstSource.firstObserver).toBeNull();
    expect(secondSource.firstObserver).toBeNull();

    computation.dispose();
  });
});
