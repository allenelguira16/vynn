import { describe, expect, it } from "vitest";

import {
  createOwner,
  disposeOwner,
  getOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import { $effect } from "../src/reactivity/effect";
import { $state, type State } from "../src/reactivity/state";
import {
  createScope,
  disposeScope,
  getCurrentScope,
  onScopeDispose,
  runWithScope,
} from "../src/render_new/lifecycle/scope";
import type { RenderScope } from "../src/render_new/types";

async function flushEffects(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("render_new scope lifecycle", () => {
  it("creates nested scopes and restores the current scope after execution", () => {
    const root = createScope(null);
    let child!: RenderScope;

    expect(getCurrentScope()).toBeNull();

    runWithScope(root, () => {
      expect(getCurrentScope()).toBe(root);

      child = createScope();

      runWithScope(child, () => {
        expect(getCurrentScope()).toBe(child);
      });

      expect(getCurrentScope()).toBe(root);
    });

    expect(getCurrentScope()).toBeNull();
    expect(child.parent).toBe(root);
    expect(root.parent).toBeNull();

    disposeScope(root);
  });

  it("inherits the active nested Owner when creating a child scope", () => {
    const root = createScope(null);
    let child!: RenderScope;

    runWithScope(root, () => {
      const nestedOwner = createOwner();

      runWithOwner(nestedOwner, () => {
        expect(getCurrentScope()).toBe(root);
        child = createScope();
      });

      expect(getCurrentScope()).toBe(root);
    });

    runWithScope(child, () => {
      expect(getCurrentScope()).toBe(child);
      expect(getOwner()?.parent).not.toBeNull();
    });

    disposeScope(root);
    expect(child.state).toBe("disposed");
  });

  it("disposes child scopes before their parent and in reverse creation order", () => {
    const root = createScope(null);
    const events: string[] = [];

    runWithScope(root, () => {
      const first = createScope();
      const second = createScope();

      runWithScope(first, () => {
        onScopeDispose(() => events.push("first"));
      });

      runWithScope(second, () => {
        onScopeDispose(() => events.push("second"));
      });

      onScopeDispose(() => events.push("root"));
    });

    disposeScope(root);
    disposeScope(root);

    expect(events).toEqual(["second", "first", "root"]);
    expect(root.state).toBe("disposed");
  });

  it("disposes reactive effects owned by the render scope", async () => {
    const scope = createScope(null);
    let count!: State<number>;
    const values: number[] = [];

    runWithScope(scope, () => {
      count = $state(0);
      $effect(() => {
        values.push(count.value);
      });
    });

    count.value = 1;
    await flushEffects();

    disposeScope(scope);
    count.value = 2;
    await flushEffects();

    expect(values).toEqual([0, 1]);
  });

  it("runs cleanups with the owning scope active and continues after errors", () => {
    const scope = createScope(null);
    const events: string[] = [];
    let scopeOwner: ReturnType<typeof getOwner>;

    runWithScope(scope, () => {
      scopeOwner = getOwner();

      onScopeDispose(() => {
        events.push("first");
        expect(getOwner()).toBe(scopeOwner);
        expect(getCurrentScope()).toBe(scope);
        throw new Error("cleanup failed");
      });

      onScopeDispose(() => {
        events.push("second");
      });
    });

    expect(() => disposeScope(scope)).toThrow(AggregateError);
    expect(events).toEqual(["first", "second"]);
    expect(scope.state).toBe("disposed");
  });

  it("reflects disposal initiated by an ancestor Vynn Owner", () => {
    const owner = createOwner(null);
    let child!: RenderScope;

    const root = runWithOwner(owner, () => createScope());

    runWithScope(root, () => {
      child = createScope();
    });

    disposeOwner(owner);

    expect(child.state).toBe("disposed");
    expect(root.state).toBe("disposed");

    // A scope whose Owner has already been disposed is safe to dispose again.
    expect(() => disposeScope(root)).not.toThrow();
    expect(() => disposeScope(child)).not.toThrow();
  });

  it("requires an active render scope to register cleanup", () => {
    expect(() => onScopeDispose(() => {})).toThrow(
      "onScopeDispose() must be called inside a render scope",
    );
  });

  it("rejects entering or extending a disposed scope", () => {
    const scope = createScope(null);
    disposeScope(scope);

    expect(() => runWithScope(scope, () => {})).toThrow(
      "Cannot enter a render scope that is disposed",
    );
    expect(() => createScope(scope)).toThrow(
      "Cannot create a child in a render scope that is disposed",
    );
  });
});
