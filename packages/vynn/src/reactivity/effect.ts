// import { getRuntimeContext } from "~/context/runtime-context";

/**
 * Effect function type with dependency tracking and cleanup
 */
export type EffectFn = (() => void) & {
  deps?: Set<EffectFn>[];
  cleanup?: () => void;
};

export let activeEffect: EffectFn | null = null;

export function setActiveEffect(newActiveEffect: EffectFn | null) {
  activeEffect = newActiveEffect;
}

let lastDisposer: (() => void) | null = null;

/**
 * Effect scheduling queue
 */
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

/**
 * Create an effect with an attached render frame
 */
export function $effect(fn: () => void | (() => void)) {
  // const context = getRuntimeContext();

  const wrappedEffect: EffectFn = () => {
    removeEffect(wrappedEffect);

    // Cleanup previous effect if any
    if (wrappedEffect.cleanup) {
      wrappedEffect.cleanup();
      wrappedEffect.cleanup = undefined;
    }

    const previousEffect = activeEffect;

    activeEffect = wrappedEffect;

    // if (context) context.effect.push(wrappedEffect);
    // const owner = getOwner();
    // if (owner) owner.cleanups.push(() => wrappedEffect.cleanup?.());

    try {
      const result = fn();
      if (typeof result === "function") {
        wrappedEffect.cleanup = result;
      }
      //  else if (result instanceof Promise) {
      //   const cleanup = await result;
      //   if (typeof cleanup === "function") {
      //     wrappedEffect.cleanup = cleanup;
      //   }
      // }
    } finally {
      activeEffect = previousEffect;
    }
  };

  const disposer = () => removeEffect(wrappedEffect);
  lastDisposer = disposer;

  wrappedEffect.deps = [];

  wrappedEffect();

  return disposer;
}

export function stopEffect() {
  if (lastDisposer) {
    lastDisposer();
    lastDisposer = null;
  }
}

/**
 * Remove an effect and run its cleanup
 */
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
