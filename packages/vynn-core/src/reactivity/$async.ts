import { getAsyncBoundary } from "../components/boundary";
import { $state } from "./$state";
import { $effect } from "./$effect";
import { NotReadyError } from "./not-ready-error";

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
  const result = $state<AsyncRecord<T> | undefined>();
  let version = 0;

  $effect(() => {
    const currentVersion = ++version;

    let promise: Promise<T>;

    try {
      promise = Promise.resolve(getter());
    } catch (error) {
      result.value = {
        status: "rejected",
        error,
        version: currentVersion,
      };
      return;
    }

    result.value = {
      status: "pending",
      promise,
      version: currentVersion,
    };

    // Attach exactly one settlement handler for this operation.
    promise.then(
      (value) => {
        if (currentVersion !== version) return;

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
    return result.value?.status === "pending";
  });

  return derived;
}
