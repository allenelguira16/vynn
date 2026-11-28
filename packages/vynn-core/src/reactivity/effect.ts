import { getRuntimeContext, runWithRuntimeContext } from "../runtime/context";
import { getErrorBoundary } from "../context/error-boundary";
import { getOwner, getOwnerCleanups, runWithOwner } from "../life-cycle/owner";
import {
  areHydrationClaimsDisabled,
  withHydrationClaimsDisabled,
} from "../client/hydration-runtime";
import { NotReadyError } from "../reactivity/async/not-ready-error";
import {
  assertNotInComputedGetter,
  batch,
  createComputation,
  execute,
  runComputation,
  untrack,
} from "./graph";

type EffectCallback = () => void | (() => void);

function reportError(error: unknown, owner: ReturnType<typeof getOwner>): void {
  if (error instanceof NotReadyError) return;

  const boundary = runWithOwner(owner, getErrorBoundary);
  if (error instanceof Error && boundary) {
    boundary(error);
    return;
  }

  throw error;
}

function createEffect(callback: EffectCallback, priority: 1 | 2): () => void {
  assertNotInComputedGetter(priority === 1 ? "$renderEffect" : "$effect");

  const owner = getOwner();
  const runtimeContext = getRuntimeContext();

  if (owner?.disposed) {
    throw new Error("[vynn]: Cannot create an effect inside a disposed owner.");
  }

  // JSX created by user effects is detached work rather than part of the
  // component's SSR output. Carry this flag into nested render effects so
  // deferred bindings cannot consume the component's hydration claims later.
  const suppressHydration = priority === 2 || areHydrationClaimsDisabled();
  const runInEffectContext = <T>(callback: () => T): T =>
    runWithOwner(owner, () =>
      suppressHydration ? withHydrationClaimsDisabled(callback) : callback(),
    );

  let cleanup: void | (() => void);
  const computation = createComputation(() => {
    batch(() => {
      const previousCleanup = cleanup;
      cleanup = undefined;

      if (previousCleanup) {
        try {
          runInEffectContext(() => untrack(previousCleanup));
        } catch (cause) {
          reportError(cause, owner);
        }
      }

      cleanup = execute(computation, () => {
        try {
          return runInEffectContext(callback);
        } catch (cause) {
          reportError(cause, owner);
          return undefined;
        }
      });
    });
  }, priority);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;

    if (owner) {
      const cleanups = owner.cleanups;
      if (cleanups) {
        const index = cleanups.indexOf(stop);
        if (index !== -1) cleanups.splice(index, 1);
      }
    }

    const finalCleanup = cleanup;
    cleanup = undefined;
    computation.dispose();

    if (finalCleanup) {
      try {
        runWithRuntimeContext(runtimeContext, () =>
          runInEffectContext(() => untrack(finalCleanup)),
        );
      } catch (cause) {
        runWithRuntimeContext(runtimeContext, () => reportError(cause, owner));
      }
    }
  };

  if (owner) getOwnerCleanups(owner).push(stop);

  try {
    runComputation(computation);
  } catch (cause) {
    stop();
    throw cause;
  }

  return stop;
}

/** Runs synchronously after derived values and before normal effects. */
export function $renderEffect(callback: EffectCallback): () => void {
  return createEffect(callback, 1);
}

/** Runs after derived computations and renderer effects. */
export function $effect(callback: EffectCallback): () => void {
  return createEffect(callback, 2);
}

export { batch, transaction, untrack } from "./graph";
