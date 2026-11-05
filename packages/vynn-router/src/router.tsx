import { $store } from "vynn";

import { LocationProvider } from "./context";
import { isServer } from "./environment";
import { $location, parseLocation, updateLocation } from "./location";
import { RouteOutlet } from "./outlet";
import type { Location, Route } from "./types";

/** Creates a Router with request-local URL state, suitable for SSR. */
export function Router(props: { url?: string; routes: Route[] }) {
  const initialLocation = parseLocation(props.url);

  // CSR uses one shared location store so navigation from async callbacks
  // updates exactly the store RouteOutlet observes. SSR still gets an isolated
  // store for each Router/request.
  const location = isServer ? $store<Location>(initialLocation) : $location;

  if (!isServer) {
    updateLocation(location, initialLocation);
  }

  return (
    <LocationProvider value={location}>
      <RouteOutlet routes={props.routes} />
    </LocationProvider>
  );
}
