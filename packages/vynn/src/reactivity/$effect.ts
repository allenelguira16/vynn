import { getCurrentOwner } from "../life-cycle/owner";

export type EffectFn = (() => void) & {
  deps?: Set<EffectFn>[];
  cleanup?: () => void;
  // suspenseBoundary?: (promise: Promise<void>) => void;
};

export let activeEffect: EffectFn | null = null;

export function setActiveEffect(newActiveEffect: EffectFn | null) {
  activeEffect = newActiveEffect;
}

let lastDisposer: (() => void) | null = null;

const effectQueue = new Set<EffectFn>();
let isFlushing = false;

export function scheduleEffect(effect: EffectFn) {
  effectQueue.add(effect);

  if (!isFlushing) {
    isFlushing = true;

    queueMicrotask(() => {
      for (const effect of effectQueue) {
        effect();
      }

      effectQueue.clear();
      isFlushing = false;
    });
  }
}

export function $effect(callback: () => void | (() => void)) {
  // const boundary =
  //   getOwnerContext<(promise: Promise<void>) => void>("suspense-boundary");
  // console.log(boundary);
  // console.log(getSuspenseBoundary());
  const owner = getCurrentOwner();

  const wrappedEffect: EffectFn = () => {
    removeEffect(wrappedEffect);

    if (wrappedEffect.cleanup) {
      wrappedEffect.cleanup();
      wrappedEffect.cleanup = undefined;
    }

    const previousEffect = activeEffect;

    activeEffect = wrappedEffect;

    try {
      const result = callback();

      if (typeof result === "function") {
        wrappedEffect.cleanup = result;
      }
    } catch (error) {
      if (error instanceof Promise) {
        // console.log(owner);
        const boundary = owner?.boundary;
        boundary?.(error);
      } else {
        throw error;
      }
    } finally {
      activeEffect = previousEffect;
    }
  };

  wrappedEffect.deps = [];
  // wrappedEffect.boundary = getSuspenseBoundary();

  const disposer = () => removeEffect(wrappedEffect);

  lastDisposer = disposer;

  wrappedEffect();

  return disposer;
}

export function stopEffect() {
  if (lastDisposer) {
    lastDisposer();
    lastDisposer = null;
  }
}

export function removeEffect(effect: EffectFn) {
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
