import { createCell, type VynnRef } from "./ref";
import { createAsyncResource } from "./resource";
import { isAsyncFunction } from "./utils";

export type State<T> = VynnRef<T>;

export function $state<T>(initializer: () => Promise<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(value: T): State<T>;
export function $state<T>(source: T | (() => T | Promise<T>)): State<T> {
  const initializer =
    typeof source === "function" ? (source as () => T | Promise<T>) : () => source;

  if (isAsyncFunction(initializer)) {
    return createAsyncResource(initializer as () => Promise<T>);
  }

  return createCell(initializer() as T);
}
