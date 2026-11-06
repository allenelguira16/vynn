import { $store, onMount } from "vynn";

import { LocationProvider } from "./context";
import { isServer } from "./environment";
import {
  $location,
  parseLocation,
  setActiveLocation,
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
    setActiveLocation(location);
    updateLocation($location, location);
    onMount(() => {
      const updateFromBrowser = () => {
        updateLocation(location, {
          pathname: window.location.pathname,
          search: window.location.search,
        });
        updateLocation($location, location);
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
