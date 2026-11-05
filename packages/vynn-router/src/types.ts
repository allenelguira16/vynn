import type { FC, PropsWithChildren } from "vynn";

export type Location = {
  pathname: string;
  search: string;
};

export type RouteParams = Readonly<Record<string, string | undefined>>;

export type BeforeLoadContext = {
  /** The pathname and query string for the pending navigation. */
  location: Location;
  /** Dynamic parameters captured by this route and its parent routes. */
  params: RouteParams;
  /** Query parameters for the pending navigation. */
  search: URLSearchParams;
};

export type Route = {
  path: string;
  component: FC<PropsWithChildren>;
  beforeLoad?: (context: BeforeLoadContext) => unknown;
  children?: Route[];
};
