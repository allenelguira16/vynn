import { JSXIntrinsicElements } from "./intrinsic-elements";

export namespace JSX {
  export type Element = false | undefined | null | string | number | Node | Element[];

  // IntrinsicAttributes augments component props, but native JSX tags are checked
  // against IntrinsicElements directly. Add the common JSX-only attributes here
  // without making them part of the DOM attribute types.
  export type IntrinsicElements = {
    [Tag in keyof JSXIntrinsicElements]: JSXIntrinsicElements[Tag] & Attributes;
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

  export interface IntrinsicAttributes {
    key?: string | number;
  }

  // export type LibraryManagedAttributes<_C, P> = NormalizeChildren<P> & {
  //   key?: string | number;
  // };
}

// type NormalizeChildren<T> = T extends { children?: () => infer R }
//   ? Omit<T, "children"> & { children?: R extends any[] ? R : R | R[] }
//   : T;
