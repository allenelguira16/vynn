import { createCell, type VynnRef } from "./ref";
import { createResource } from "./resource";

export type State<T> = VynnRef<T>;

export function $state<T>(initializer: () => PromiseLike<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(initializer: () => T | PromiseLike<T>): State<T>;
export function $state<T>(value?: T): State<T>;
export function $state<T>(source?: T | (() => T | PromiseLike<T>)): State<T> {
  if (typeof source !== "function") {
    return createCell(source as T);
  }

  return createResource(source as () => T | PromiseLike<T>);
}
