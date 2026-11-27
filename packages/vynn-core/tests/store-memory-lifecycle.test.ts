import { describe, expect, it } from "vitest";

import { createComputation, execute, type Source } from "../src/reactivity/graph";
import { $store } from "../src/reactivity/store";

function getSingleDependency(computation: ReturnType<typeof createComputation>): Source {
  const dependency = computation.dependencies;
  if (!dependency || dependency instanceof Set) {
    throw new Error("Expected exactly one tracked store dependency.");
  }
  return dependency;
}

describe("$store dependency lifecycle", () => {
  it("keeps a source when a computation immediately re-tracks the same key", () => {
    const state = $store({ value: 1 });
    const computation = createComputation(() => {});

    execute(computation, () => {
      void state.value;
    });
    const original = getSingleDependency(computation);

    execute(computation, () => {
      void state.value;
    });

    expect(getSingleDependency(computation)).toBe(original);
    computation.dispose();
  });

  it("evicts a source after its final computation stops observing that key", () => {
    const state = $store({ first: 1, second: 2 });
    const computation = createComputation(() => {});

    execute(computation, () => {
      void state.first;
    });
    const firstSource = getSingleDependency(computation);

    execute(computation, () => {
      void state.second;
    });
    const secondSource = getSingleDependency(computation);

    expect(secondSource).not.toBe(firstSource);

    execute(computation, () => {
      void state.first;
    });

    // The old source was removed from the target's dependency map and a new
    // source is created when the property is observed again.
    expect(getSingleDependency(computation)).not.toBe(firstSource);
    computation.dispose();
  });

  it("retains a source while another computation still observes the key", () => {
    const state = $store({ value: 1 });
    const first = createComputation(() => {});
    const second = createComputation(() => {});

    execute(first, () => {
      void state.value;
    });
    const original = getSingleDependency(first);

    execute(second, () => {
      void state.value;
    });
    expect(getSingleDependency(second)).toBe(original);

    first.dispose();

    const third = createComputation(() => {});
    execute(third, () => {
      void state.value;
    });
    expect(getSingleDependency(third)).toBe(original);

    second.dispose();
    third.dispose();
  });
});
