import { $store, onMount } from "vynn";

import type { Location, Route } from "./types";

import { LocationProvider } from "./context";
import { isServer } from "./environment";
import { parseLocation, updateDefaultLocation, updateLocation } from "./location";
import { RouteOutlet } from "./outlet";

/** Creates a Router with request-local URL state, suitable for SSR. */
export function Router(props: { url?: string; routes: Route[] }) {
  const location = $store<Location>(parseLocation(props.url));

  if (!isServer) {
    // Router-specific state stays in this instance's context. The fallback
    // store follows the browser URL and is updated by navigation/popstate.

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
