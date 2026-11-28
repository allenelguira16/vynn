import { createContext } from "vynn";

import type { RouterInstance } from "./types";
import type { CompiledRoute } from "./matcher";

export type RouteSlotContextValue = {
  router: RouterInstance<unknown>;
  parentNode: CompiledRoute;
};

export const [RouteSlotsProvider, useRouteSlots] =
  createContext<RouteSlotContextValue>();
