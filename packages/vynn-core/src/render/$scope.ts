import type { JSX } from "../types/jsx";

import {
  HYDRATION_SCOPE_END_SSR_MARKER,
  HYDRATION_SCOPE_START_SSR_MARKER,
} from "../const";
import {
  allocateOwnerIdentityID,
  createOwner,
  getOwner,
  runWithOwner,
} from "../life-cycle/owner";
import {
  getServerRenderedHydrationScopeRange,
  withServerRenderedHydrationScope,
} from "../client/hydration-runtime";
import { rootNodes } from "./$cmpnt.util";
import { createSSRComment } from "./resolve-node";

/**
 * Isolates JSX created outside the component's returned render tree.
 *
 * The scope owner reserves a stable identity before its contents are created.
 * SSR emits range markers around the resulting nodes; hydration collects the
 * nodes inside that range into a private element/text queue, so eager JSX
 * construction cannot consume claims belonging to unrelated siblings.
 */
export function $scope(render: () => JSX.Element): JSX.Element {
  const parent = getOwner();
  if (!parent) return render();

  // A hydration scope is not a component identity boundary. Reserve a range
  // ID from the nearest identity owner, but keep this Owner transparent so
  // context lookup and descendant identity allocation continue through parent.
  const id = allocateOwnerIdentityID(parent);
  const owner = createOwner(parent, { identity: false });

  if (id === undefined) {
    return runWithOwner(owner, render);
  }

  if (import.meta.env.SSR) {
    return runWithOwner(owner, () => [
      createSSRComment(`${HYDRATION_SCOPE_START_SSR_MARKER}:${id}`),
      render(),
      createSSRComment(`${HYDRATION_SCOPE_END_SSR_MARKER}:${id}`),
    ] as JSX.Element);
  }

  const range = getServerRenderedHydrationScopeRange(id);
  const start = range?.start ?? document.createTextNode("");
  const end = range?.end ?? document.createTextNode("");

  // Treat the scope's start anchor as its lifecycle marker. Removing the
  // rendered range then disposes its owner and all descendants just like a
  // component marker does.
  rootNodes.set(start, owner);

  return withServerRenderedHydrationScope(id, owner, () => [
    start,
    render(),
    end,
  ] as JSX.Element);
}
