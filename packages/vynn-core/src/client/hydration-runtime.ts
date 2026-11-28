import { createOwner, getOwner, runWithOwner, type Owner } from "../life-cycle/owner";

/**
 * Optional client hydration services.
 *
 * Shared renderer modules depend on this small facade instead of importing the
 * hydration implementation. hydrateToDOM installs the real services; ordinary
 * client rendering keeps the bridge inert and can tree-shake hydration code.
 */
export type ServerRenderedLazyRange = {
  start: Text;
  end: Text;
  nodes: Node[];
};

export type ServerRenderedHydrationScopeRange = {
  start: Text;
  end: Text;
};

type HydrationRuntime = {
  isClaimActive: () => boolean;
  isHydrating: (waitForLazy?: boolean) => boolean;
  claimElement: <T extends Element>() => T | undefined;
  claimText: () => Text | undefined;
  isElementCompatible: (
    node: Element | undefined,
    expectedTag: string,
    expectedNamespace: string,
  ) => boolean;
  synchronizeText: (node: Text | undefined, expectedText: string) => node is Text;
  diagnoseAttribute: (element: Element, name: string, expectedValue: string | null) => void;
  withServerRenderedLazy: <T>(lazyID: string, callback: () => T) => T;
  getServerRenderedLazyRange: (lazyID: string) => ServerRenderedLazyRange | undefined;
  finishServerRenderedLazy: (lazyID: string) => void;
  withServerRenderedHydrationScope: <T>(id: string, owner: Owner, callback: () => T) => T;
  getServerRenderedHydrationScopeRange: (id: string) => ServerRenderedHydrationScopeRange | undefined;
  runAfterHydration: (callback: () => unknown, waitForLazy?: boolean) => void;
};

let hydrationRuntime: HydrationRuntime | undefined;

export function installHydrationRuntime(runtime: HydrationRuntime): void {
  hydrationRuntime = runtime;
}

export function isHydrationClaimActive(): boolean {
  return hydrationRuntime?.isClaimActive() ?? false;
}

export function isHydrating(waitForLazy = true): boolean {
  return hydrationRuntime?.isHydrating(waitForLazy) ?? false;
}

export function claimHydrationElement<T extends Element>(): T | undefined {
  return hydrationRuntime?.claimElement<T>();
}

export function claimHydrationText(): Text | undefined {
  return hydrationRuntime?.claimText();
}

export function isHydrationElementCompatible(
  node: Element | undefined,
  expectedTag: string,
  expectedNamespace: string,
): boolean {
  return hydrationRuntime?.isElementCompatible(node, expectedTag, expectedNamespace) ?? false;
}

export function synchronizeHydrationText(
  node: Text | undefined,
  expectedText: string,
): node is Text {
  return hydrationRuntime?.synchronizeText(node, expectedText) ?? false;
}

export function diagnoseHydrationAttribute(
  element: Element,
  name: string,
  expectedValue: string | null,
): void {
  hydrationRuntime?.diagnoseAttribute(element, name, expectedValue);
}

export function withServerRenderedLazy<T>(
  lazyID: string,
  callback: () => T,
): T {
  if (hydrationRuntime) {
    return hydrationRuntime.withServerRenderedLazy(lazyID, callback);
  }

  // Preserve the lazy component's dedicated owner even when there are no
  // server-rendered nodes to claim.
  const owner = createOwner(undefined, { identity: false });
  return runWithOwner(owner, callback);
}

export function getServerRenderedLazyRange(
  lazyID: string,
): ServerRenderedLazyRange | undefined {
  return hydrationRuntime?.getServerRenderedLazyRange(lazyID);
}

export function finishServerRenderedLazy(lazyID: string): void {
  hydrationRuntime?.finishServerRenderedLazy(lazyID);
}

export function runAfterHydration(
  callback: () => unknown,
  waitForLazy = true,
): void {
  if (hydrationRuntime) {
    hydrationRuntime.runAfterHydration(callback, waitForLazy);
  } else {
    runWithOwner(getOwner(), callback);
  }
}

/** Run a JSX subtree with its own hydration claim queues. */
export function withServerRenderedHydrationScope<T>(
  id: string,
  owner: Owner,
  callback: () => T,
): T {
  if (hydrationRuntime) {
    return hydrationRuntime.withServerRenderedHydrationScope(id, owner, callback);
  }

  return runWithOwner(owner, callback);
}

/** Get the marker anchors for a JSX subtree's server-rendered hydration range. */
export function getServerRenderedHydrationScopeRange(
  id: string,
): ServerRenderedHydrationScopeRange | undefined {
  return hydrationRuntime?.getServerRenderedHydrationScopeRange(id);
}
