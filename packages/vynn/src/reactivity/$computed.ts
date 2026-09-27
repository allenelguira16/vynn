import { $state } from "./$state";
import { $effect } from "./$effect";
import { untrack } from "./untrack";

export type Computed<T> = {
  value: UnwrapPromise<T>;
};

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

const context = new WeakMap<object, { value: any }>();

export const isPending = (computed: object) => !context.get(computed)?.value;

export function $computed<T>(getter: () => T): Computed<T> {
  let pending: Promise<UnwrapPromise<T>> | undefined;

  const result = $state<UnwrapPromise<T>>();

  $effect(() => {
    untrack(() => {
      result.value = undefined;
    });

    const value = getter();

    if (value instanceof Promise) {
      pending = value;

      value.then((resolved) => {
        if (pending !== value) return;

        pending = undefined;
        untrack(() => {
          result.value = resolved;
        });
      });

      return;
    }

    pending = undefined;
    result.value = value as UnwrapPromise<T>;
  });

  const computed = {
    get value() {
      // IMPORTANT:
      // Read the reactive state before throwing.
      // const value = result.value;

      if (pending) {
        throw pending;
      }

      return result.value as UnwrapPromise<T>;
      // return value as UnwrapPromise<T>;
    },
    set value(value: UnwrapPromise<T>) {
      result.value = value;
    },
  };

  context.set(computed, result);

  return computed;
}
