import { getErrorBoundary } from "../context/error-boundary-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity/not-ready-error";
import { transaction, scheduleEffect } from "./transaction";

export type EffectPhase = "effect" | "render";

export type EffectFn = (() => void) & {
  deps?: Set<EffectFn>[];
  cleanup?: () => void;
  phase?: EffectPhase;
  disposed?: boolean;
  running?: boolean;
  rerun?: boolean;
};

export let activeEffect: EffectFn | null = null;

/**
 * Sets the effect currently being evaluated.
 */
export function setActiveEffect(newActiveEffect: EffectFn | null): void {
  activeEffect = newActiveEffect;
}

let lastDisposer: (() => void) | null = null;

/**
 * Creates a reactive effect with the specified execution phase.
 */
function createReactiveEffect(
  callback: () => void | (() => void),
  phase: EffectPhase,
): () => void {
  const owner = getOwner();

  let wrappedEffect!: EffectFn;

  wrappedEffect = (() => {
    if (wrappedEffect.disposed) {
      return;
    }

    // Avoid recursively executing an effect that is already running.
    // Its next execution happens after the current execution completes.
    if (wrappedEffect.running) {
      wrappedEffect.rerun = true;
      return;
    }

    wrappedEffect.running = true;

    try {
      do {
        wrappedEffect.rerun = false;

        if (wrappedEffect.disposed) {
          break;
        }

        runWithOwner(owner, () =>
          transaction(() => {
            // Remove old dependencies and run the previous cleanup.
            removeEffect(wrappedEffect);

            const previousEffect = activeEffect;
            activeEffect = wrappedEffect;

            try {
              const result = callback();

              if (typeof result === "function") {
                wrappedEffect.cleanup = result;
              }
            } catch (error) {
              if (error instanceof NotReadyError) {
                // DO NOTHING
                return;
              }

              const errorBoundary = getErrorBoundary();
              if (error instanceof Error && errorBoundary) {
                errorBoundary(error);
                return;
              }

              throw error;
              // Preserve the existing Vynn NotReadyError behavior.
            } finally {
              activeEffect = previousEffect;
            }
          }),
        );
      } while (wrappedEffect.rerun && !wrappedEffect.disposed);
    } finally {
      wrappedEffect.running = false;
    }
  }) as EffectFn;

  wrappedEffect.deps = [];
  wrappedEffect.phase = phase;
  wrappedEffect.disposed = false;
  wrappedEffect.running = false;
  wrappedEffect.rerun = false;

  const disposer = () => {
    if (wrappedEffect.disposed) {
      return;
    }

    wrappedEffect.disposed = true;
    removeEffect(wrappedEffect);
  };

  lastDisposer = disposer;

  // Register cleanup before initial execution. The initial execution may
  // trigger an ErrorBoundary that disposes this effect's owner immediately.
  owner?.cleanups.push(disposer);

  wrappedEffect();

  return disposer;
}

/**
 * Creates an application-level effect.
 *
 * Initial execution is immediate. Subsequent executions are scheduled
 * through Vynn's normal effect queue.
 */
export function $effect(callback: () => void | (() => void)): () => void {
  return createReactiveEffect(callback, "effect");
}

/**
 * Creates a synchronous render-phase effect.
 *
 * Initial execution is immediate. Subsequent executions happen
 * synchronously when the surrounding transaction commits.
 */
export function $renderEffect(callback: () => void | (() => void)): () => void {
  return createReactiveEffect(callback, "render");
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
 * Removes an effect from its dependencies and runs its cleanup.
 */
export function removeEffect(effect: EffectFn): void {
  if (effect.deps) {
    for (const depSet of effect.deps) {
      depSet.delete(effect);
    }

    effect.deps.length = 0;
  }

  if (effect.cleanup) {
    const cleanup = effect.cleanup;
    effect.cleanup = undefined;

    cleanup();
  }
}

export { scheduleEffect };
