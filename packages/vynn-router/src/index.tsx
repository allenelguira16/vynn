export type {
  BeforeLoadContext,
  Location,
  Route,
  RouteParams,
  RouterInstance,
  RouterOptions,
  RouterState,
} from "./types";

export type { MemoryHistory, MemoryHistoryOptions, RouterHistory } from "./history";

export { createBrowserHistory, createMemoryHistory } from "./history";
export { createRouter } from "./create-router";
export { $location, navigate, replace } from "./location";
export { $params, $search } from "./params";
export { Router } from "./router";
export { isActiveRoute, Link } from "./link";
export { redirect, type RedirectOptions, type RedirectStatus } from "./redirect";
