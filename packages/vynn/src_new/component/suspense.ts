import { $state } from "@/reactivity/state";
import { JSX } from "@/types/jsx";

/**
 * Suspense component for suspending async operations
 *
 * @param props - The props of the component.
 * @returns jsx function
 */
export function Suspense(props: { fallback?: JSX.Element; children: JSX.Element }): JSX.Element {
  const { fallback: _fallback = () => null, children: _children } = props as unknown as {
    fallback?: () => JSX.Element;
    children: () => JSX.Element;
  };

  const fallback = _fallback();
  const children = _children();

  const view = $state(children);

  // return () => {
  // try {
  suspenseBoundaryStack.push((error) => {
    // console.log("called");
    view.value = fallback;

    error.then(() => {
      view.value = children;
    });
    return fallback;
  });

  return () => {
    return () => {
      try {
        return view.value;
      } catch (error) {
        console.log(error);
      }
    };
  };
  // setTimeout(() => {
  //   view.value = () => "hi";
  // }, 1000);
  // console.log("rerender?");
  // console.log();
  // console.log(jsx(() => Fragment, {}));
  // return () => () => jsx(Fragment, { children: () => () => view.value });
  // return jsx(() => Fragment);
  // } catch (error) {
  //   console.log(error);
  // }
  // };

  // return () => {
  // try {
  //   return () => jsx(() => () => children());
  // } catch (error) {}
  // };
  // return () => {
  //   suspenseBoundaryStack.push((error) => {
  //     try {
  //       return fallback;
  //     } finally {
  //       suspenseBoundaryStack.pop();
  //     }
  //   });
  //   try {
  //     return children;
  //   } catch (error) {
  //     console.log("hi");
  //   }
  // };
}

const suspenseBoundaryStack: ((promise: Promise<void>) => void)[] = [];

export function getSuspenseBoundary() {
  // return suspenseBoundaryStack.pop();
  return suspenseBoundaryStack[suspenseBoundaryStack.length - 1] as
    | ((promise: Promise<void>) => void)
    | undefined;
}
