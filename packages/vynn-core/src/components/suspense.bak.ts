import { JSX } from "../types/jsx";
import { $state } from "../reactivity/$state";
import { $cmpnt } from "../render/$cmpnt";
import { $dyn } from "../render/$dyn";

const suspenseBoundaries: ((promise: Promise<void>) => void)[] = [];

/**
 * Returns the currently active Suspense boundary.
 *
 * The active boundary is the nearest Suspense component being evaluated.
 * It can be used to register an async operation with that boundary.
 *
 * @returns The active Suspense boundary, or `undefined` when evaluated
 * outside of a Suspense boundary.
 */
export function getSuspenseBoundary() {
  return suspenseBoundaries[suspenseBoundaries.length - 1] as
    | ((promise: Promise<void>) => void)
    | undefined;
}

/**
 * Renders content with a fallback while an async operation is pending.
 *
 * Content rendered inside the boundary can register promises with the
 * currently active Suspense boundary. The fallback is displayed while
 * those promises are pending, and the children are displayed once they
 * resolve.
 *
 * @param props The fallback content and children to render.
 * @returns The active Suspense view.
 */
export const Suspense = $cmpnt(function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}) {
  const view = $state<Node>();

  const fallback = document.createDocumentFragment();
  const children = document.createDocumentFragment();

  const boundary = (promise: Promise<void>) => {
    if (!fallback.childNodes.length) {
      fallback.append(...$dyn(() => props.fallback));
    }

    view.value = fallback;

    promise.then(() => {
      if (!children.childNodes.length) {
        children.append(...$dyn(() => props.children));
      }

      view.value = children;
    });
  };

  suspenseBoundaries.push(boundary);

  try {
    fallback.append(...$dyn(() => props.fallback));
    children.append(...$dyn(() => props.children));
  } finally {
    suspenseBoundaries.pop();
  }

  return $dyn(() => view.value || children);
});
