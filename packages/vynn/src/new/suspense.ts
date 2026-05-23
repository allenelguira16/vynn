import { $state } from "~/reactivity/state";
import { JSX } from "~/types/jsx";

import { jsx } from "./jsx";

const suspenseBoundaryStack: (() => void)[] = [];
export const getSuspenseBoundary = () => {
  // console.log(suspenseBoundaryStack);
  // try {
  return suspenseBoundaryStack[suspenseBoundaryStack.length - 1];
  // } finally {
  //   suspenseBoundaryStack.pop();
  // }
};

/**
 * Suspense component for suspending async operations
 *
 * @param props - The props of the component.
 * @returns jsx function
 */
export const Suspense = (props: { fallback?: JSX.Element; children: JSX.Element }) => {
  const { fallback: fallback = () => null, children: children } = props as unknown as {
    fallback?: () => JSX.Element;
    children: () => JSX.Element;
  };

  // const fallback = memo(_fallback);
  // const children = memo(_children);

  const view = $state<() => JSX.Element>(children);

  suspenseBoundaryStack.push(() => {
    return fallback();
  });
  return children();
  // suspenseBoundaryStack.push(() => {
  //   view.value = fallback;
  // });
  // setTimeout(() => {
  //   view.value = children;
  //   console.log("hi");
  // }, 1000);

  // return () => {
  //   return view.value;
  // };
  // return children;
  // return memo(() => {
  //   // return () => view.value;
  // });
};

type Resolvable<T> = T | (() => Resolvable<T>);

type Resolve<T> = T extends () => infer R ? Resolve<R> : T;

export function resolveValue<T>(value: T): Resolve<T> {
  let current = value;

  while (typeof current === "function") {
    current = (current as () => unknown)();
  }

  return current as Resolve<T>;
}

export function resolveArray<T extends readonly unknown[]>(
  values: T,
): { [K in keyof T]: Resolve<T[K]> } {
  return values.map(resolveValue) as {
    [K in keyof T]: Resolve<T[K]>;
  };
}
