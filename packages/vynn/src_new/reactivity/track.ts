import { activeEffect, EffectFn, scheduleEffect } from "./effect";

/**
 * WeakMap to track which targets/keys map to which effects
 */
const targetToPropertyEffectsMap: WeakMap<object, Map<PropertyKey, Set<EffectFn>>> = new WeakMap();

/**
 * Track a property
 *
 * @param target - The target object.
 * @param key - The property key.
 */
export function track(target: object, key: PropertyKey) {
  if (!activeEffect) return;

  let propertyEffectsMap = targetToPropertyEffectsMap.get(target);
  if (!propertyEffectsMap) {
    propertyEffectsMap = new Map();
    targetToPropertyEffectsMap.set(target, propertyEffectsMap);
  }

  let effects = propertyEffectsMap.get(key);
  if (!effects) {
    effects = new Set();
    propertyEffectsMap.set(key, effects);
  }

  if (!effects.has(activeEffect)) {
    effects.add(activeEffect);
    // Record this dependency set for cleanup later
    if (activeEffect.deps) {
      activeEffect.deps.push(effects);
    } else {
      activeEffect.deps = [effects];
    }
  }
}

/**
 * Trigger a property
 *
 * @param target - The target object.
 * @param key - The property key.
 */
export function trigger(target: object, key: PropertyKey) {
  const propertyEffectsMap = targetToPropertyEffectsMap.get(target);
  if (!propertyEffectsMap) return;

  const effects = propertyEffectsMap.get(key);
  if (!effects) return;

  for (const effect of effects) {
    scheduleEffect(effect);
  }
}
