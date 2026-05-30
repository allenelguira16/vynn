import { JSX, FC, PropsWithChildren } from 'vynn';

type Route = {
    path: string;
    component: FC<PropsWithChildren>;
    children?: Route[];
};
type Location = {
    pathname: string;
    search: string;
};
declare const $location: Location;
declare function navigate(path: string): void;
declare function isActiveRoute(targetpath: string): boolean;
declare function Router(props: {
    url?: string;
    routes: Route[];
}): JSX.Element;
declare function Link({ children, href, activeClass, class: className, }: {
    children: () => JSX.Element;
    href: string;
    activeClass?: string;
    class?: string;
}): JSX.Element;

export { $location, Link, Router, isActiveRoute, navigate };
export type { Location, Route };
