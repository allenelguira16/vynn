import { $store, onDestroy, onMount } from "vynn";

import { LocationProvider } from "./context";
import { isServer } from "./environment";
import {
  $location,
  parseLocation,
  registerRouterLocation,
  updateLocation,
} from "./location";
import { RouteOutlet } from "./outlet";
import type { Location, Route } from "./types";

/** Creates a Router with request-local URL state, suitable for SSR. */
export function Router(props: { url?: string; routes: Route[] }) {
  const location = $store<Location>(parseLocation(props.url));

  if (!isServer) {
    // Keep legacy consumers synchronized, but never mutate the module-level
    // singleton on the server: separate requests have separate Router stores.
    updateLocation($location, location);

    // Register immediately, not in onMount. A route's beforeLoad can redirect
    // while the initial CSR tree is still being created, before mount callbacks
    // have been flushed.
    const unregisterLocation = registerRouterLocation(location);
    onDestroy(unregisterLocation);

    onMount(() => {
      const updateFromBrowser = () => {
        updateLocation(location, {
          pathname: window.location.pathname,
          search: window.location.search,
        });
        updateLocation($location, location);
      };

      window.addEventListener("popstate", updateFromBrowser);
      window.addEventListener("vynn:navigate", updateFromBrowser);
      return () => {
        window.removeEventListener("popstate", updateFromBrowser);
        window.removeEventListener("vynn:navigate", updateFromBrowser);
      };
    });
  }

  return (
    <LocationProvider value={location}>
      <RouteOutlet routes={props.routes} />
    </LocationProvider>
  );
}
