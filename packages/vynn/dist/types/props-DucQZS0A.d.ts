import { J as JSX } from './dom-attributes-CCUg0DNA.js';

type PropsWithChildren<T = unknown> = T & {
    children: () => JSX.Element;
};
type PropsWithRef<T = unknown> = T & {
    ref: (element: HTMLElement) => void;
};
type FC<T = object> = (props: T) => JSX.Element;

export type { FC as F, PropsWithChildren as P, PropsWithRef as a };
