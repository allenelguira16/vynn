import { JSXIntrinsicElements } from "./intrinsic-elements";

export namespace JSX {
  export type Element =
    | false
    | undefined
    | null
    | string
    | number
    | Node
    | Element[]
    | (() => Element);

  export type IntrinsicElements = JSXIntrinsicElements;

  export interface ElementChildrenAttribute {
    children: object;
  }

  export interface ElementAttributesProperty {
    props: object;
  }

  export interface Attributes {
    key?: string | number;
  }

  export type LibraryManagedAttributes<_C, P> = NormalizeChildren<P> & {
    key?: string | number;
  };
}

type NormalizeChildren<T> = T extends { children?: () => infer R }
  ? Omit<T, "children"> & { children?: R extends any[] ? R : R | R[] }
  : T;
