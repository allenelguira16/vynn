import { activeEffect, setActiveEffect } from "./$effect";

/**
 * Executes a function without collecting reactive dependencies.
 *
 * Any reactive values accessed while the function runs are not tracked by
 * the currently active effect.
 *
 * @template T The return type of the function.
 * @param fn The function to execute without tracking dependencies.
 * @returns The value returned by `fn`.
 */
export function untrack<T>(fn: () => T): T {
  const previousEffect = activeEffect;

  setActiveEffect(null);

  try {
    return fn();
  } finally {
    setActiveEffect(previousEffect);
  }
}
