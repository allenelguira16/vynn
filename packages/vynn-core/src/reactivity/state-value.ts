import { createCell, type VynnRef } from "./ref";

/**
 * Lightweight entry used by the JSX compiler for $state() calls whose
 * arguments are statically known not to be functions.
 *
 * Keep this module independent from state.ts so direct values do not retain
 * initializer, async-resource, or hydration code.
 */
export function $stateValue<T>(value: T): VynnRef<T> {
  return createCell(value);
}
