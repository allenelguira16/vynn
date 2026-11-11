import type { Route } from "./types";

export const PATHLESS_ROUTE = Symbol("vynn-router.pathless-route");
export const REQUIRE_CHILD_MATCH = Symbol("vynn-router.require-child-match");

export type InternalRoute<TContext = undefined> = Route<TContext> & {
  [PATHLESS_ROUTE]?: true;
  [REQUIRE_CHILD_MATCH]?: true;
};
