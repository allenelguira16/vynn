import { isPending, registerPending } from "./pending";
import { markRef, type VynnReadonlyRef } from "./ref";
import { createResource } from "./resource";

export type Computed<T> = VynnReadonlyRef<T>;

export function $computed<T>(getter: () => PromiseLike<T>): Computed<T>;
export function $computed<T>(getter: () => T | PromiseLike<T>): Computed<T>;
export function $computed<T>(getter: () => T): Computed<T>;
export function $computed<T>(getter: () => T | PromiseLike<T>): Computed<T> {
  if (typeof getter !== "function") {
    throw new TypeError("[vynn]: $computed() requires a getter function.");
  }

  // Synchronous results are cached and re-evaluated lazily after invalidation.
  // PromiseLike results use the same resource lifecycle for refreshes,
  // pending state, hydration, and async-boundary integration.
  const resource = createResource(getter, {
    computed: true,
  });

  const computed = markRef({
    get value(): T {
      return resource.value;
    },
  }) as Computed<T>;

  registerPending(computed, () => isPending(resource));
  return computed;
}
