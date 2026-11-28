import type { Route } from "./types";

export const PATHLESS_ROUTE = Symbol("vynn-router.pathless-route");
export const REQUIRE_CHILD_MATCH = Symbol("vynn-router.require-child-match");
export const ABSOLUTE_ROUTE_PATH = Symbol("vynn-router.absolute-route-path");
export const INTERCEPTED_ROUTE = Symbol("vynn-router.intercepted-route");

export type InternalRoute<TContext = undefined> = Route<TContext> & {
  [PATHLESS_ROUTE]?: true;
  [REQUIRE_CHILD_MATCH]?: true;
  [ABSOLUTE_ROUTE_PATH]?: string;
  [INTERCEPTED_ROUTE]?: true;
};
