import { getCurrentOwner, runWithOwner } from "../life-cycle/owner";
import { getAsyncBoundary } from "../components/boundary";
import { transaction, scheduleEffect } from "./transaction";
import { IS_SERVER_ENV } from "../utils/is-server-env";
import { registerSSRPromise } from "../render/render-to-string";

export type EffectFn = (() => void) & {
  deps?: Set<EffectFn>[];
  cleanup?: () => void;
};

export let activeEffect: EffectFn | null = null;

/**
 * Sets the effect currently being evaluated.
 *
 * @param newActiveEffect The effect to make active, or `null` when no effect
 * is currently being evaluated.
 */
export function setActiveEffect(newActiveEffect: EffectFn | null): void {
  activeEffect = newActiveEffect;
}

let lastDisposer: (() => void) | null = null;

/**
 * Creates and runs a reactive effect.
 *
 * The callback runs immediately and is re-run when any reactive values it
 * accesses change. Returning a function registers it as the effect cleanup,
 * which runs before the effect re-executes or is disposed.
 *
 * Async errors represented by promises are forwarded to the nearest
 * Suspense boundary.
 *
 * @param callback The function to execute reactively. It may return a cleanup
 * function that runs before the next execution or when the effect is disposed.
 * @returns A function that disposes the effect.
 */
export function $effect(callback: () => void | (() => void)): () => void {
  const owner = getCurrentOwner();

  const wrappedEffect: EffectFn = () => {
    return runWithOwner(owner, () =>
      transaction(() => {
        removeEffect(wrappedEffect);

        const previousEffect = activeEffect;

        activeEffect = wrappedEffect;

        try {
          const result = callback();

          if (typeof result === "function") {
            wrappedEffect.cleanup = result;
          }
        } catch (error) {
          if (error instanceof Promise) {
            const boundary = getAsyncBoundary();

            boundary?.(error);
          } else {
            throw error;
          }
        } finally {
          activeEffect = previousEffect;
        }
      }),
    );
  };

  wrappedEffect.deps = [];

  const disposer = () => {
    removeEffect(wrappedEffect);
  };

  lastDisposer = disposer;

  wrappedEffect();

  owner?.cleanups.push(disposer);

  return disposer;
}

/**
 * Disposes the most recently created effect.
 */
export function stopEffect(): void {
  if (lastDisposer) {
    lastDisposer();
    lastDisposer = null;
  }
}

/**
 * Removes an effect from all of its dependencies and runs its cleanup.
 *
 * @param effect The effect to remove.
 */
export function removeEffect(effect: EffectFn): void {
  if (effect.deps) {
    for (const depSet of effect.deps) {
      depSet.delete(effect);
    }

    effect.deps.length = 0;
  }

  if (effect.cleanup) {
    effect.cleanup();
    effect.cleanup = undefined;
  }
}

export { scheduleEffect };
