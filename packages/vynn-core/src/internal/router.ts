import { withoutAsyncBoundary } from "../context/async-context";
import { transaction } from "../reactivity/transaction";

/**
 * Reads a route guard resource without registering it with an enclosing
 * Await boundary. Route guards must settle before SSR can decide whether to
 * render a route or return a redirect response.
 *
 * This is a private integration point for vynn-router, not a public Vynn API.
 */
export function readRouteGuard<T>(read: () => T): T {
  return withoutAsyncBoundary(read);
}

/**
 * Batches the router's related location writes into one reactive commit.
 *
 * This is an internal integration point, not part of Vynn's public API.
 */
export function batchRouterLocation<T>(callback: () => T): T {
  return transaction(callback);
}
