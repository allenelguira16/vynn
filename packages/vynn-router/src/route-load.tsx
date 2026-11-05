import { $async, $state, Await, registerSsrBlockingTask } from "vynn";
import { $if } from "vynn/render";
import type { JSX } from "vynn";

import { isServer } from "./environment";
import { isClientRedirectError } from "./redirect";
import type { Route } from "./types";

type LoadState =
  | { status: "pending" }
  | { status: "ready" }
  | { status: "redirected" }
  | { status: "error"; error: unknown };

/**
 * Suspends one matched route until its guard completes.
 *
 * On the client, a state machine is used instead of throwing NotReadyError
 * from $async. RouteOutlet must be able to finish and cache the matched route
 * while its guard is pending; otherwise every retry can create a new guard.
 *
 * On the server, $async + Await preserves the streaming SSR blocking behavior.
 */
export function RouteLoadBoundary(props: {
  beforeLoad: NonNullable<Route["beforeLoad"]>;
  render: () => JSX.Element;
}) {
  if (isServer) {
    const load = $async(() => {
      const promise = (async () => {
        await props.beforeLoad();
        return true;
      })();

      // Streaming SSR must wait for the guard before committing HTTP 200.
      registerSsrBlockingTask(promise);
      return promise;
    });

    return (
      <Await fallback={null}>
        {load.value ? props.render() : null}
      </Await>
    );
  }

  const state = $state<LoadState>({ status: "pending" });

  const reject = (error: unknown) => {
    state.value = isClientRedirectError(error)
      ? { status: "redirected" }
      : { status: "error", error };
  };

  // Invoke the guard synchronously so route context is available to its
  // synchronous work. Async continuations can still use redirect(), which
  // updates the browser URL and then rejects with ClientRedirectError.
  try {
    const result = props.beforeLoad();

    if (result && typeof result.then === "function") {
      Promise.resolve(result).then(
        () => {
          state.value = { status: "ready" };
        },
        reject,
      );
    } else {
      state.value = { status: "ready" };
    }
  } catch (error) {
    reject(error);
  }

  // This branch only changes once the guard settles. It never suspends the
  // RouteOutlet render that needs to cache this matched route.
  return $if(
    () => state.value.status !== "pending",
    () => {
      const current = state.value;

      if (current.status === "error") {
        throw current.error;
      }

      return current.status === "ready" ? props.render() : null;
    },
    () => null,
  );
}
