import { onDestroy } from "vynn";

import type { RouterInstance, RouterOptions } from "./types";

import { createRouter } from "./create-router";
import { LocationProvider } from "./context";
import { RouteOutlet } from "./outlet";

type RouterProps<TContext> =
  | { router: RouterInstance<TContext> }
  | RouterOptions<TContext>;

/**
 * Renders a router instance.
 *
 * Prefer createRouter() so the same instance can also be used for navigation,
 * state inspection, and route context outside the component tree. The direct
 * routes/url form remains supported for compatibility.
 */
export function Router<TContext = undefined>(props: RouterProps<TContext>) {
  const ownsRouter = !("router" in props);
  const router = "router" in props ? props.router : createRouter(props);

  // An instance passed by the caller has an explicit lifetime and may be
  // mounted elsewhere. Only dispose the compatibility instance we create.
  if (ownsRouter) {
    onDestroy(() => router.dispose());
  }

  return (
    <LocationProvider value={router.state.location}>
      <RouteOutlet
        routes={router.routes}
        context={router.context}
        notFound={router.notFound}
      />
    </LocationProvider>
  );
}
