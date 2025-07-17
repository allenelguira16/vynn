import { clientStreamContext, getCurrentStream } from "~/context";
import { $effect, $store, untrack } from "~/reactivity";
import { isServer, isServerStreaming } from "~/util";

export type ResourceReturn<T> = {
  readonly loading: boolean;
  readonly error: Error | null;
  readonly data: T;
  refetch: () => void;
  mutate: (newValue: T) => void;
};

/**
 * Create a reactive resource
 *
 * @param fetcher - The function to fetch the data.
 * @returns The resource.
 */
export function resource<T, const P extends any[]>(
  fetcher: (...params: P) => Promise<T>,
  _params: P,
): ResourceReturn<T> {
  const context = clientStreamContext();
  const id = context.resourceID++;

  const state = $store({
    loading: true,
    error: null as Error | null,
    data: undefined as T | undefined,
    promiseStatus: "pending" as "pending" | "fulfilled" | "rejected",
  });

  let promise: Promise<T> | null = null;

  const refetch = () => {
    const params = _params.map((p) => p()) as P;
    untrack(() => {
      state.loading = true;
      state.error = null;
      state.data = undefined as T | undefined;
      state.promiseStatus = "pending";
    });

    if (
      !isServerStreaming &&
      !isServer &&
      (window as any).__resource &&
      (window as any).__resource[id]
    ) {
      untrack(() => {
        state.data = (window as any).__resource[id];
        state.error = null;
        state.promiseStatus = "fulfilled";
        state.loading = false;
      });

      delete (window as any).__resource[id];
      if (!(window as any).__resource.length) {
        delete (window as any).__resource;
      }
    } else {
      promise = untrack(() => fetcher(...params));

      promise
        .then((result) => {
          untrack(() => {
            state.data = result;
            state.error = null;
            state.promiseStatus = "fulfilled";
            state.loading = false;
          });

          if (isServerStreaming) {
            const { controller, encoder } = getCurrentStream();

            controller.enqueue(
              encoder.encode(
                `<script>window.__resource ??= []; window.__resource[${id}] = ${JSON.stringify(result)};document.currentScript.remove();</script>`,
              ),
            );
          }
        })
        .catch((err) => {
          untrack(() => {
            state.data = undefined as T | undefined;
            state.error = err;
            state.promiseStatus = "rejected";
            state.loading = false;
          });
        });
    }
  };

  $effect(() => {
    refetch();
  });

  return {
    get loading() {
      return state.loading;
    },
    get error() {
      return state.error;
    },
    get data() {
      if (state.promiseStatus === "pending") throw promise;
      if (state.promiseStatus === "rejected") throw state.error;

      return state.data as T;
    },
    refetch,
    mutate(newValue: T) {
      state.data = newValue;
    },
  };
}
