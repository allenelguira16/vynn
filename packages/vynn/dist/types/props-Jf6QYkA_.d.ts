import { J as JSX } from './jsx-BgHN_1Il.js';

/**
 * Create a fragment
 *
 * @param children - The children of the fragment.
 * @returns The fragment.
 */
declare function Fragment({ children }: {
    children?: () => JSX.Element;
}): (() => JSX.Element) | undefined;

type PropsWithChildren<T = unknown> = T & {
    children: () => JSX.Element;
};
type PropsWithRef<T = unknown> = T & {
    ref: (element: HTMLElement) => void;
};
type FC<T = object> = (props: T) => JSX.Element;

export { Fragment as a };
export type { FC as F, PropsWithChildren as P, PropsWithRef as b };
