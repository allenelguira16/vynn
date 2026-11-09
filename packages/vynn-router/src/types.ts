import type { FC, PropsWithChildren } from "vynn";

export type Location = {
  pathname: string;
  search: string;
};

export type RouteParams = Readonly<Record<string, string | undefined>>;

export type BeforeLoadContext = {
  /** The pathname and query string captured when this route view is created. */
  location: Location;
  /** Dynamic and catch-all parameters captured for this route entry. */
  params: RouteParams;
  /** Query parameters captured for this route entry. */
  search: URLSearchParams;
  /** Aborted when the RouteView that owns this guard is disposed. */
  signal: AbortSignal;
};

export type Route = {
  /** A terminal `*` matches any remaining path segments. Its value is available as `params["*"]`. */
  path: string;
  component: FC<PropsWithChildren>;
  beforeLoad?: (context: BeforeLoadContext) => Promise<unknown>;
  children?: Route[];
};
