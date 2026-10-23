import { getAsyncBoundary } from "../context/async-boundary";
import { $state } from "./$state";
import { $renderEffect } from "./$effect";
import { NotReadyError } from "./not-ready-error";
import { getRenderMode } from "../context/render-mode";
import { transaction } from "./transaction";
import { isInsideLazy } from "../components/lazy";
import { withFakeAsyncApis } from "./$async.util";
import { getAsyncID } from "../context/async-id";
import { getAsyncValue, getAsyncValues } from "../context/async-values";

export type Async<T> = {
  value: T;
};

type AsyncRecord<T> =
  | {
      status: "pending";
      promise: Promise<T>;
      version: number;
    }
  | {
      status: "resolved";
      value: T;
      version: number;
    }
  | {
      status: "rejected";
      error: unknown;
      version: number;
    };

const context = new WeakMap<object, () => boolean>();

export function isPending(value: object): boolean {
  return context.get(value)?.() ?? false;
}

export function $async<T>(getter: () => Promise<T>): Async<T> {
  const asyncID = getAsyncID();
  const result = $state<AsyncRecord<T> | undefined>();
  let version = 0;

  $renderEffect(() => {
    transaction(() => {
      const currentVersion = ++version;
      const $asyncValues = getAsyncValues();
      const isLazy = isInsideLazy();

      const ssrData = isLazy ? undefined : getAsyncValue(asyncID);

      let promise!: Promise<T>;

      try {
        if (ssrData) {
          withFakeAsyncApis(getter);
        } else {
          promise = Promise.resolve(getter());
        }
      } catch (error) {
        result.value = {
          status: "rejected",
          error,
          version: currentVersion,
        };
        return;
      }

      if (ssrData) {
        result.value = {
          status: "resolved",
          value: ssrData,
          version: currentVersion,
        };
      } else {
        result.value = {
          status: "pending",
          promise,
          version: currentVersion,
        };

        // Attach exactly one settlement handler for this operation.
        promise.then(
          (value) => {
            if (currentVersion !== version) return;
            if ($asyncValues && !isLazy) $asyncValues[asyncID] = value;

            result.value = {
              status: "resolved",
              value,
              version: currentVersion,
            };
          },
          (error: unknown) => {
            if (currentVersion !== version) return;

            result.value = {
              status: "rejected",
              error,
              version: currentVersion,
            };
          },
        );
      }
    });
  });

  const derived: Async<T> = {
    get value(): T {
      const record = result.value;

      if (!record) {
        throw new Error(
          "$async was read before its operation was initialized.",
        );
      }

      if (record.status === "pending") {
        const boundary = getAsyncBoundary();

        if (boundary) boundary(record.promise);
        throw new NotReadyError(record.promise);
      }

      if (record.status === "rejected") {
        throw record.error;
      }

      return record.value;
    },

    set value(value: T) {
      // Manual assignment invalidates any older outstanding request.
      const currentVersion = ++version;

      result.value = {
        status: "resolved",
        value,
        version: currentVersion,
      };
    },
  };

  context.set(derived, () => {
    if (getRenderMode()) derived.value; // On SSR, make this be handle by renderSSRChildren and defer it

    return result.value?.status === "pending";
  });

  return derived;
}
