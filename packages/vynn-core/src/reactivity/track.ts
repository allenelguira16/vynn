import { type EffectFn, activeEffect, scheduleEffect } from "./$effect";

/**
 * Maps a reactive object to its property dependencies.
 *
 * target
 *   └── property
 *         └── effects
 */
const targetToPropertyEffectsMap: WeakMap<object, Map<unknown, Set<EffectFn>>> = new WeakMap();

/**
 * Tracks an access to a property or collection key for the active effect.
 */
export function track(target: object, key: unknown): void {
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
 * Schedules every effect that depends on a reactive property or collection key.
 *
 * A snapshot is necessary because a synchronous render effect can remove and
 * re-register itself while this dependency set is being read.
 */
export function trigger(target: object, key: unknown): void {
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

/**
 * Triggers array length and iteration dependencies, together with any indexed
 * dependencies invalidated by truncating the array.
 */
export function triggerArrayLength(
  target: object,
  newLength: number,
  arrayIterationKey: PropertyKey,
): void {
  const propertyEffectsMap = targetToPropertyEffectsMap.get(target);

  if (!propertyEffectsMap) {
    return;
  }

  const effects = new Set<EffectFn>();

  for (const [key, dependencies] of propertyEffectsMap) {
    const isIndex =
      typeof key === "string" &&
      key !== "" &&
      Number.isInteger(Number(key)) &&
      Number(key) >= 0 &&
      Number(key) < 0xffff_ffff &&
      String(Number(key)) === key;

    if (
      key === "length" ||
      key === arrayIterationKey ||
      (isIndex && Number(key) >= newLength)
    ) {
      for (const effect of dependencies) {
        effects.add(effect);
      }
    }
  }

  for (const effect of effects) {
    scheduleEffect(effect);
  }
}

/**
 * Schedules every effect that depends on any property of a target.
 *
 * Collection clear operations remove every entry, so every dependency
 * associated with that collection becomes stale.
 */
export function triggerAll(target: object): void {
  const propertyEffectsMap = targetToPropertyEffectsMap.get(target);

  if (!propertyEffectsMap) {
    return;
  }

  const effects = new Set<EffectFn>();

  for (const dependency of propertyEffectsMap.values()) {
    for (const effect of dependency) {
      effects.add(effect);
    }
  }

  for (const effect of effects) {
    scheduleEffect(effect);
  }
}
