import { getErrorBoundary } from "../context/error-boundary-context";
import { getOwner, runWithOwner, type Owner } from "../life-cycle/owner";
import { NotReadyError } from "./not-ready-error";
import { cleanupSubscriber, withSubscriber, type ReactiveSubscriber } from "./graph";

export { track, trigger, triggerAll, triggerArrayLength, untrack } from "./graph";

export type EffectPhase = "render" | "effect";

export interface ReactiveEffect extends ReactiveSubscriber {
  callback: () => void | (() => void);
  phase: EffectPhase;
  owner: Owner | null;
  cleanup?: () => void;
  scheduler?: () => void;
  running: boolean;
  rerun: boolean;
  run: () => void;
}

export type ReactiveEffectOptions = {
  phase?: EffectPhase;
  owner?: Owner | null;
  scheduler?: () => void;
};

const renderQueue = new Set<ReactiveEffect>();
const effectQueue = new Set<ReactiveEffect>();
let batchDepth = 0;
let isFlushingRenderEffects = false;
let isFlushingEffects = false;
let isEffectFlushScheduled = false;

function schedule(effect: ReactiveEffect): void {
  if (effect.disposed) return;

  if (effect.scheduler) {
    effect.scheduler();
    return;
  }

  if (effect.running) {
    effect.rerun = true;
    return;
  }

  if (effect.phase === "render") {
    renderQueue.add(effect);
    if (batchDepth === 0) flushRenderEffects();
    return;
  }

  effectQueue.add(effect);
  scheduleEffectFlush();
}

function handleEffectError(error: unknown): void {
  if (error instanceof NotReadyError) return;

  const boundary = getErrorBoundary();

  if (error instanceof Error && boundary) {
    boundary(error);
    return;
  }

  throw error;
}

function runEffect(effect: ReactiveEffect): void {
  if (effect.disposed) return;

  if (effect.running) {
    effect.rerun = true;
    return;
  }

  effect.running = true;

  try {
    do {
      effect.rerun = false;
      if (effect.disposed) break;

      cleanupSubscriber(effect);

      if (effect.cleanup) {
        const cleanup = effect.cleanup;
        effect.cleanup = undefined;

        try {
          cleanup();
        } catch (error) {
          handleEffectError(error);
        }
      }

      batchDepth++;

      try {
        const cleanup = withSubscriber(effect, () =>
          runWithOwner(effect.owner, () => {
            try {
              return effect.callback();
            } catch (error) {
              handleEffectError(error);
              return undefined;
            }
          }),
        );
        if (typeof cleanup === "function") effect.cleanup = cleanup;
      } finally {
        batchDepth--;
      }
    } while (effect.rerun && !effect.disposed);
  } finally {
    effect.running = false;
  }

  if (batchDepth === 0) flushQueues();
}

function flushRenderEffects(): void {
  if (isFlushingRenderEffects || batchDepth > 0) return;

  isFlushingRenderEffects = true;
  const errors: unknown[] = [];

  try {
    while (renderQueue.size > 0) {
      const effects = [...renderQueue];
      renderQueue.clear();

      for (const effect of effects) {
        try {
          runEffect(effect);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  } finally {
    isFlushingRenderEffects = false;
  }

  throwEffectErrors(errors, "Render effects failed.");
}

function scheduleEffectFlush(): void {
  if (isEffectFlushScheduled || isFlushingEffects) return;

  isEffectFlushScheduled = true;
  queueMicrotask(flushEffects);
}

function flushEffects(): void {
  isEffectFlushScheduled = false;
  isFlushingEffects = true;
  const errors: unknown[] = [];

  try {
    while (effectQueue.size > 0) {
      const effects = [...effectQueue];
      effectQueue.clear();

      for (const effect of effects) {
        try {
          runEffect(effect);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  } finally {
    isFlushingEffects = false;
  }

  if (effectQueue.size > 0) scheduleEffectFlush();
  throwEffectErrors(errors, "Multiple effects failed.");
}

function flushQueues(): void {
  if (batchDepth > 0) return;
  flushRenderEffects();

  if (effectQueue.size > 0) scheduleEffectFlush();
}

function throwEffectErrors(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

export function createReactiveEffect(
  callback: () => void | (() => void),
  options: ReactiveEffectOptions = {},
): ReactiveEffect {
  const owner = options.owner === undefined ? getOwner() : options.owner;

  const effect: ReactiveEffect = {
    callback,
    phase: options.phase ?? "effect",
    owner,
    dependencies: [],
    scheduler: options.scheduler,
    disposed: false,
    running: false,
    rerun: false,
    notify: () => schedule(effect),
    run: () => runEffect(effect),
  };

  if (owner) {
    owner.cleanups.push(() => stopReactiveEffect(effect));
  }

  runEffect(effect);

  return effect;
}

export function stopReactiveEffect(effect: ReactiveEffect): void {
  if (effect.disposed) return;

  effect.disposed = true;
  cleanupSubscriber(effect);

  if (effect.cleanup) {
    const cleanup = effect.cleanup;
    effect.cleanup = undefined;
    cleanup();
  }

  renderQueue.delete(effect);
  effectQueue.delete(effect);
}

export function batch<T>(callback: () => T): T {
  batchDepth++;

  try {
    return callback();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flushQueues();
  }
}

export const transaction = batch;

export function $effect(callback: () => void | (() => void)): () => void {
  const effect = createReactiveEffect(callback, { phase: "effect" });
  return () => stopReactiveEffect(effect);
}

export function $renderEffect(callback: () => void | (() => void)): () => void {
  const effect = createReactiveEffect(callback, { phase: "render" });
  return () => stopReactiveEffect(effect);
}
