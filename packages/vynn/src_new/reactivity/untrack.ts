import { activeEffect, setActiveEffect } from "./effect";

/**
 * Unwrap a reactive value
 *
 * @param fn - The function that returns the reactive value.
 * @returns The reactive value.
 */
export function untrack<T>(fn: () => T): T {
  const prevEffect = activeEffect;
  setActiveEffect(null); // disable tracking

  try {
    return fn();
  } finally {
    setActiveEffect(prevEffect); // restore previous tracking context
  }
}
