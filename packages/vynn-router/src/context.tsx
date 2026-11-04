import { createContext } from "vynn";

import type { Location } from "./types";

export const [LocationProvider, useRouterLocation] = createContext<Location>();
export const [RoutePathProvider, useRoutePath] = createContext<string>();
