import { createCell, type VynnRef } from "./ref";
import { createAsyncResource, createMaybeAsyncResource } from "./resource";
import { isAsyncFunction } from "./utils";

export type State<T> = VynnRef<T>;

export function $state<T>(initializer: () => Promise<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(value?: T): State<T>;
export function $state<T>(source?: T | (() => T | Promise<T>)): State<T> {
  if (typeof source !== "function") {
    return createCell(source as T);
  }

  const initializer = source as () => T | Promise<T>;

  if (isAsyncFunction(initializer)) {
    return createAsyncResource(initializer as () => Promise<T>);
  }

  return createMaybeAsyncResource(initializer);
}
