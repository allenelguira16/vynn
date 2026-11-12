import { createCell, type VynnRef } from "./ref";
import { createAsyncResource } from "./resource";
import { isAsyncFunction } from "./utils";

export type State<T> = VynnRef<T>;

export function $state<T>(initializer: () => Promise<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(initializer: () => T | Promise<T>): State<T> {
  if (typeof initializer !== "function") {
    throw new TypeError("[vynn]: $state() requires an initializer function.");
  }

  if (isAsyncFunction(initializer)) {
    return createAsyncResource(initializer as () => Promise<T>, {
      retainPrevious: true,
    });
  }

  return createCell(initializer() as T);
}
