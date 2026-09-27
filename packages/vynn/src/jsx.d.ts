export namespace JSX {
  export type Element =
    | false
    | undefined
    | null
    | string
    | number
    | Node
    | Element[];

  export type IntrinsicElements = {
    [element: string]: any;
  };

  export interface ElementChildrenAttribute {
    children: object;
  }

  export interface ElementAttributesProperty {
    props: object;
  }

  export interface Attributes {
    key?: string | number;
  }

  // export type LibraryManagedAttributes<_C, P> = NormalizeChildren<P> & {
  //   key?: string | number;
  // };
}
