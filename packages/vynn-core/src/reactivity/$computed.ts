import { getAsyncBoundary } from "../context/async-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import { createAsyncDerived } from "./$async";
import { $renderEffect } from "./$effect";
import { createCell } from "./cell";
import { isAsyncFunction } from "./is-async-function";
import { NotReadyError } from "./not-ready-error";
import { isPending as getPending, registerPending } from "./pending";

export type Computed<T> = {
  readonly value: T;
};

export type ComputedOptions = {
  /** Keep an asynchronous computation outside streaming SSR Await boundaries. */
  blockSSR?: boolean;
};

type ComputedRecord<T> =
  | {
      status: "value";
      value: T;
    }
  | {
      status: "error";
      error: unknown;
    };

/**
 * Creates an eager, memoized synchronous computation.
 *
 * The getter runs immediately, tracks its dependencies, and reruns
 * synchronously when one of them changes. Consumers subscribe to the
 * memoized result rather than directly to every source dependency.
 */
function createComputed<T>(getter: () => T): Computed<T> {
  const result = createCell<ComputedRecord<T> | undefined>(undefined);
  let current: ComputedRecord<T> | undefined;

  $renderEffect(() => {
    let next: ComputedRecord<T>;

    try {
      next = {
        status: "value",
        value: getter(),
      };
    } catch (error) {
      next = {
        status: "error",
        error,
      };
    }

    // Preserve memo equality semantics: downstream consumers only rerun when
    // the computed value or error actually changes.
    if (
      (current?.status === "value" &&
        next.status === "value" &&
        Object.is(current.value, next.value)) ||
      (current?.status === "error" &&
        next.status === "error" &&
        Object.is(current.error, next.error))
    ) {
      return;
    }

    current = next;
    result.value = next;
  });

  const computed: Computed<T> = {
    get value() {
      const record = result.value;

      if (!record) {
        throw new Error("[vynn]: $computed failed to initialize its value.");
      }

      if (record.status === "error") {
        // The eager computation may have run before its eventual consumer's
        // Await boundary existed. Register the pending promise at read time
        // when the current boundary differs from the one that first saw it.
        if (record.error instanceof NotReadyError) {
          const boundary = getAsyncBoundary();

          if (boundary && boundary !== record.error.boundary) {
            boundary(record.error.promise);
          }
        }

        throw record.error;
      }

      return record.value;
    },
  };

  registerPending(computed, () => {
    const record = result.value;
    return record?.status === "error" && record.error instanceof NotReadyError;
  });

  return computed;
}

/**
 * Creates an eager read-only reactive value derived from other reactive values.
 *
 * Synchronous getters are memoized and rerun when dependencies change.
 * Async getters create an eager async-derived value that tracks dependencies
 * before the first await and retains its last resolved value during refresh.
 *
 * @template T The computed value type.
 * @param getter A synchronous or asynchronous derivation.
 * @param options Configuration for async computation behavior during SSR.
 * @returns A read-only reactive value containing the derived result.
 */
export function $computed<T>(getter: () => Promise<T>, options?: ComputedOptions): Computed<T>;
export function $computed<T>(getter: () => T, options?: ComputedOptions): Computed<T>;
export function $computed<T>(
  getter: () => T | Promise<T>,
  options: ComputedOptions = {},
): Computed<T> {
  // Lazy component loaders are ordinary functions that return a Promise.
  // Their explicit lazy marker is the async signal and must take precedence
  // over the normal function-vs-async-function distinction. This also keeps
  // their loader promise out of the SSR async-value hydration registry.
  if (!isAsyncFunction(getter) && !isAsyncGetterFromLazy(getter)) {
    return createComputed(getter as () => T);
  }

  const derived = createAsyncDerived(getter as () => Promise<T>, options.blockSSR);
  const computed: Computed<T> = {
    get value() {
      return derived.value;
    },
  };

  registerPending(computed, () => getPending(derived));

  return computed;
}
