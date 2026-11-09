import type { FC, PropsWithChildren } from "vynn";

export type Location = {
  pathname: string;
  search: string;
};

export type RouteParams = Readonly<Record<string, string | undefined>>;

export type BeforeLoadContext = {
  /** The pathname and query string for the pending navigation. */
  location: Location;
  /** Dynamic and catch-all parameters captured by this route and its parent routes. */
  params: RouteParams;
  /** Query parameters for the pending navigation. */
  search: URLSearchParams;
  /** Aborted when a newer navigation supersedes this guard or its route unmounts. */
  signal: AbortSignal;
};

export type Route = {
  /** A terminal `*` matches any remaining path segments. Its value is available as `params["*"]`. */
  path: string;
  component: FC<PropsWithChildren>;
  beforeLoad?: (context: BeforeLoadContext) => Promise<unknown>;
  children?: Route[];
};
