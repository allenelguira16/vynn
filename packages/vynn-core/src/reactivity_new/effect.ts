import { getErrorBoundary } from "../context/error-boundary-context";
import { getOwner, runWithOwner, type Owner } from "../life-cycle/owner";
import { NotReadyError } from "./not-ready-error";

export type EffectPhase = "render" | "effect";

export interface ReactiveEffect {
  callback: () => void | (() => void);
  phase: EffectPhase;
  owner: Owner | null;
  dependencies: Set<ReactiveEffect>[];
  cleanup?: () => void;
  scheduler?: () => void;
  disposed: boolean;
  running: boolean;
  rerun: boolean;
  run: () => void;
}

export type ReactiveEffectOptions = {
  phase?: EffectPhase;
  lazy?: boolean;
  owner?: Owner | null;
  scheduler?: () => void;
};

const dependencies = new WeakMap<object, Map<unknown, Set<ReactiveEffect>>>();
const renderQueue = new Set<ReactiveEffect>();
const effectQueue = new Set<ReactiveEffect>();

let activeEffect: ReactiveEffect | null = null;
let batchDepth = 0;
let isFlushingRenderEffects = false;
let isFlushingEffects = false;
let isEffectFlushScheduled = false;

function getDependency(target: object, key: unknown): Set<ReactiveEffect> {
  let targetDependencies = dependencies.get(target);

  if (!targetDependencies) {
    targetDependencies = new Map();
    dependencies.set(target, targetDependencies);
  }

  let dependency = targetDependencies.get(key);

  if (!dependency) {
    dependency = new Set();
    targetDependencies.set(key, dependency);
  }

  return dependency;
}

export function track(target: object, key: unknown): void {
  const effect = activeEffect;

  if (!effect || effect.disposed) return;

  const dependency = getDependency(target, key);
  if (dependency.has(effect)) return;

  dependency.add(effect);
  effect.dependencies.push(dependency);
}

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

export function trigger(target: object, key: unknown): void {
  const dependency = dependencies.get(target)?.get(key);
  if (!dependency) return;

  for (const effect of [...dependency]) schedule(effect);
}

export function triggerAll(target: object): void {
  const targetDependencies = dependencies.get(target);
  if (!targetDependencies) return;

  const effects = new Set<ReactiveEffect>();

  for (const dependency of targetDependencies.values()) {
    for (const effect of dependency) effects.add(effect);
  }

  for (const effect of effects) schedule(effect);
}

export function triggerArrayLength(
  target: object,
  nextLength: number,
  iterationKey: PropertyKey,
): void {
  const targetDependencies = dependencies.get(target);
  if (!targetDependencies) return;

  const effects = new Set<ReactiveEffect>();

  for (const [key, dependency] of targetDependencies) {
    const isIndex =
      typeof key === "string" &&
      key !== "" &&
      Number.isInteger(Number(key)) &&
      Number(key) >= 0 &&
      Number(key) < 0xffff_ffff &&
      String(Number(key)) === key;

    if (key === "length" || key === iterationKey || (isIndex && Number(key) >= nextLength)) {
      for (const effect of dependency) effects.add(effect);
    }
  }

  for (const effect of effects) schedule(effect);
}

function removeDependencies(effect: ReactiveEffect): void {
  for (const dependency of effect.dependencies) dependency.delete(effect);
  effect.dependencies.length = 0;
}

function handleEffectError(error: unknown): void {
  if (error instanceof NotReadyError) return;

  const boundary = getErrorBoundary();

  if (error instanceof Error && boundary) {
    boundary.handle(error);
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

      removeDependencies(effect);

      if (effect.cleanup) {
        const cleanup = effect.cleanup;
        effect.cleanup = undefined;

        try {
          cleanup();
        } catch (error) {
          handleEffectError(error);
        }
      }

      const previousEffect = activeEffect;
      activeEffect = effect;
      batchDepth++;

      try {
        const cleanup = runWithOwner(effect.owner, () => {
          try {
            return effect.callback();
          } catch (error) {
            handleEffectError(error);
            return undefined;
          }
        });
        if (typeof cleanup === "function") effect.cleanup = cleanup;
      } finally {
        activeEffect = previousEffect;
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
    run: () => runEffect(effect),
  };

  if (owner) {
    owner.cleanups.push(() => stopReactiveEffect(effect));
  }

  if (!options.lazy) runEffect(effect);

  return effect;
}

export function stopReactiveEffect(effect: ReactiveEffect): void {
  if (effect.disposed) return;

  effect.disposed = true;
  removeDependencies(effect);

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

export function untrack<T>(callback: () => T): T {
  const previousEffect = activeEffect;
  activeEffect = null;

  try {
    return callback();
  } finally {
    activeEffect = previousEffect;
  }
}

export function $effect(callback: () => void | (() => void)): () => void {
  const effect = createReactiveEffect(callback, { phase: "effect" });
  return () => stopReactiveEffect(effect);
}

export function $renderEffect(callback: () => void | (() => void)): () => void {
  const effect = createReactiveEffect(callback, { phase: "render" });
  return () => stopReactiveEffect(effect);
}
