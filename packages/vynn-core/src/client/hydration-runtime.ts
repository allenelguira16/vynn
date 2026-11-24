import { createOwner, getOwner, runWithOwner } from "../life-cycle/owner";

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
  withServerRenderedLazy: <T>(lazyID: string | number, callback: () => T) => T;
  getServerRenderedLazyRange: (lazyID: string | number) => ServerRenderedLazyRange | undefined;
  finishServerRenderedLazy: (lazyID: string | number) => void;
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
  lazyID: string | number,
  callback: () => T,
): T {
  if (hydrationRuntime) {
    return hydrationRuntime.withServerRenderedLazy(lazyID, callback);
  }

  // Preserve a dedicated lazy owner without disconnecting it from the
  // component tree when hydration services are not installed.
  const owner = createOwner(getOwner(), { identity: false });
  return runWithOwner(owner, callback);
}

export function getServerRenderedLazyRange(
  lazyID: string | number,
): ServerRenderedLazyRange | undefined {
  return hydrationRuntime?.getServerRenderedLazyRange(lazyID);
}

export function finishServerRenderedLazy(lazyID: string | number): void {
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
