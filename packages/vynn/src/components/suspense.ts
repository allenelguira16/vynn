import { JSX } from "../jsx";
import { getCurrentOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity/$state";
import { $cmpnt } from "../client/$cmpnt";
import { $dyn } from "../client/$dyn";

export const Suspense = $cmpnt(function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}) {
  const isPending = $state(false);

  const boundary = (promise: Promise<void>) => {
    isPending.value = true;

    promise.then(() => {
      isPending.value = false;
    });
  };

  const owner = getCurrentOwner();
  if (owner) owner.boundary = boundary;

  const result = $dyn(() =>
    runWithOwner(owner, () =>
      isPending.value ? props.fallback : props.children,
    ),
  );

  return result;
});
