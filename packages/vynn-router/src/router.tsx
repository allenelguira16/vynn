import { $store, onMount } from "vynn";

import { LocationProvider } from "./context";
import { isServer } from "./environment";
import {
  parseLocation,
  setActiveLocation,
  updateDefaultLocation,
  updateLocation,
} from "./location";
import { RouteOutlet } from "./outlet";
import type { Location, Route } from "./types";

/** Creates a Router with request-local URL state, suitable for SSR. */
export function Router(props: { url?: string; routes: Route[] }) {
  const location = $store<Location>(parseLocation(props.url));

  if (!isServer) {
    // Keep the fallback store synchronized for consumers outside a Router.
    // Route components read the request-local store through the $location facade.
    setActiveLocation(location);
    updateDefaultLocation(location);

    onMount(() => {
      const updateFromBrowser = () => {
        const next = {
          pathname: window.location.pathname,
          search: window.location.search,
        };

        updateLocation(location, next);
        updateDefaultLocation(next);
      };

      window.addEventListener("popstate", updateFromBrowser);
      return () => window.removeEventListener("popstate", updateFromBrowser);
    });
  }

  return (
    <LocationProvider value={location}>
      <RouteOutlet routes={props.routes} />
    </LocationProvider>
  );
}
