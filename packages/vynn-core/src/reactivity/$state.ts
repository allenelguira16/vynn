import { track, trigger } from "./track";
import { getCurrentTransaction, transaction } from "./transaction";

export type State<T> = {
  value: T;
};

/**
 * Creates a reactive state value.
 *
 * Reading `value` tracks the current reactive computation, and writing
 * `value` triggers updates when the value changes.
 *
 * Writes made outside an existing transaction are automatically wrapped
 * in a transaction.
 *
 * @template T The type of the state value.
 * @param initialValue The initial value of the state.
 * @returns A reactive state object containing the current value.
 */
export function $state<T>(initialValue: T): State<T>;

export function $state<T = undefined>(): State<T | undefined>;

export function $state<T>(initialValue?: T): State<T | undefined> {
  const state = {
    value: initialValue,
  };

  return new Proxy(state, {
    get(target, key, receiver) {
      track(target, key);
      return Reflect.get(target, key, receiver);
    },

    set(target, key, newValue, receiver) {
      const oldValue = target[key as keyof typeof target];

      const write = () => {
        const result = Reflect.set(target, key, newValue, receiver);

        if (oldValue !== newValue) {
          trigger(target, key);
        }

        return result;
      };

      // Already inside a transaction.
      if (getCurrentTransaction()) {
        return write();
      }

      // Automatically create a transaction for standalone writes.
      let result!: boolean;

      transaction(() => {
        result = write();
      });

      return result;
    },
  });
}
