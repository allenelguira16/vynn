import { markRef, type VynnRef } from "./ref";
import { track, trigger } from "./track";
import { getCurrentTransaction, transaction } from "./transaction";

export type Cell<T> = VynnRef<T>;

/**
 * Creates a small reactive cell used by state and internal resource records.
 */
export function createCell<T>(initialValue: T): Cell<T> {
  const state = {
    value: initialValue,
  };

  const cell = new Proxy(state, {
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

      if (getCurrentTransaction()) {
        return write();
      }

      let result!: boolean;

      transaction(() => {
        result = write();
      });

      return result;
    },
  });

  return markRef(cell) as Cell<T>;
}
