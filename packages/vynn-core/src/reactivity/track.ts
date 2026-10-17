import { activeEffect, scheduleEffect, type EffectFn } from "./$effect";

/**
 * Maps a reactive object to its property dependencies.
 *
 * target
 *   └── property
 *         └── effects
 */
const targetToPropertyEffectsMap: WeakMap<
  object,
  Map<PropertyKey, Set<EffectFn>>
> = new WeakMap();

/**
 * Tracks a reactive property access for the currently active effect.
 */
export function track(target: object, key: PropertyKey): void {
  const effect = activeEffect;

  if (!effect) {
    return;
  }

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

  if (effects.has(effect)) {
    return;
  }

  effects.add(effect);

  if (effect.deps) {
    effect.deps.push(effects);
  } else {
    effect.deps = [effects];
  }
}

/**
 * Schedules every effect that depends on a reactive property.
 *
 * A snapshot is necessary because a synchronous render effect can
 * remove and re-register itself while this dependency set is being read.
 */
export function trigger(target: object, key: PropertyKey): void {
  const propertyEffectsMap = targetToPropertyEffectsMap.get(target);

  if (!propertyEffectsMap) {
    return;
  }

  const effects = propertyEffectsMap.get(key);

  if (!effects) {
    return;
  }

  for (const effect of [...effects]) {
    scheduleEffect(effect);
  }
}
