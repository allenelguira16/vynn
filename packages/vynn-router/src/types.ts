import type { FC, PropsWithChildren } from "vynn";

export type Route = {
  path: string;
  component: FC<PropsWithChildren>;
  children?: Route[];
};

export type Location = {
  pathname: string;
  search: string;
};

export type RouteParams = Readonly<Record<string, string | undefined>>;
