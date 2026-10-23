import { enterErrorBoundary } from "../context/error-boundary";
import { JSX } from "../jsx-runtime";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity/$state";
import { $cmpnt, $nodes } from "../render";

export const ErrorBoundary = $cmpnt(function ErrorBoundary(props: {
  fallback?: (error: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const owner = getOwner();

  enterErrorBoundary((error) => {
    view.value = props.fallback?.(error, () => {
      runWithOwner(owner, () => {
        console.log("retried");
        // handle();
      });
    });
  });

  const view = $state<JSX.Element>();

  view.value = props.children;
  // function handle() {
  //   try {
  //     view.value = props.children;
  //   } catch (error) {
  //     if (!(error instanceof Error)) {
  //       throw error;
  //     }

  //     view.value = props.fallback?.(error, () => {
  //       runWithOwner(owner, () => {
  //         console.log("retried");
  //         handle();
  //       });
  //     });
  //   }
  // }
  // handle();

  return $nodes(() => view.value);
});
