import { JSX } from "./jsx";

export type PropsWithChildren<T = unknown> = T & {
  children: () => JSX.Element;
};

export type PropsWithRef<T = unknown> = T & {
  ref: (element: HTMLElement) => void;
};

export type FC<T = object> = (props: T) => JSX.Element;
