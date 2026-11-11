import type { FC, PropsWithChildren } from "vynn";

import type { RouterHistory } from "./history";

export type Location = {
  pathname: string;
  search: string;
};

export type RouteParams = Readonly<Record<string, string | undefined>>;

export type BeforeLoadContext<TContext = undefined> = {
  /** Dependencies supplied to createRouter(). */
  context: TContext;
  /** The pathname and query string captured when this route view is created. */
  location: Location;
  /** Dynamic and catch-all parameters captured for this route entry. */
  params: RouteParams;
  /** Query parameters captured for this route entry. */
  search: URLSearchParams;
  /** Aborted when the RouteView that owns this guard is disposed. */
  signal: AbortSignal;
};

export type Route<TContext = undefined> = {
  /** A terminal `*` captures one or more segments; `*?` captures zero or more. */
  path: string;
  component: FC<PropsWithChildren>;
  beforeLoad?: (context: BeforeLoadContext<TContext>) => unknown;
  children?: Route<TContext>[];
};

export type RouterState = {
  location: Location;
};

export type RouterOptions<TContext = undefined> = {
  routes: Route<TContext>[];
  /** Initial request URL. Used by the default history implementation. */
  url?: string;
  /** Values made available to each route's beforeLoad context. */
  context?: TContext;
  /** Custom history. When supplied, its current location takes precedence over url. */
  history?: RouterHistory;
  /** Component rendered when no route matches the current URL. */
  notFound?: FC<PropsWithChildren>;
};

export type RouterInstance<TContext = undefined> = {
  readonly routes: Route<TContext>[];
  readonly context: TContext;
  readonly history: RouterHistory;
  readonly state: RouterState;
  readonly notFound?: FC<PropsWithChildren>;
  navigate(to: string): void;
  replace(to: string): void;
  /** Unsubscribes the router from history and releases its owned history. */
  dispose(): void;
};
