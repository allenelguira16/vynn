// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ErrorBoundary } from "../src/components/error-boundary";
import { ASYNC_DATA_SSR_KEY, ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import {
  enterAsyncBoundary,
  getAsyncID,
  getAsyncValue,
  getAsyncValues,
  initializeAsyncContext,
  initializeLazyAsyncScope,
  reserveAsyncIDReservations,
} from "../src/context/async-context";
import { initializeErrorBoundaryContext } from "../src/context/error-boundary-context";
import {
  createHydrationIDTracker,
  enterHydrationIDTracker,
  getHydrationIDReservations,
} from "../src/context/hydration-id-context";
import {
  getLazyID,
  initializeLazyContext,
  initializeLazyScope,
  isPromiseFromLazy,
  registerPromiseFromLazy,
  reserveLazyIDReservations,
  regsterAsyncGetterFromLazy,
} from "../src/context/lazy-context";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $computed } from "../src/reactivity/$computed";
import { isPending } from "../src/reactivity/async";
import { NotReadyError } from "../src/reactivity/not-ready-error";

describe("lazy hydration identities", () => {
  it("keeps lazy component loaders eager without consuming async hydration IDs", async () => {
    const owner = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;
    const serverSnapshot = { "lazy:0:0": "server-only-value" };
    windowValues[ASYNC_DATA_SSR_KEY] = serverSnapshot;

    let executions = 0;
    const componentExport = () => "component";
    const loadPromise = Promise.resolve(componentExport);
    const loadComponent = () => {
      executions += 1;
      registerPromiseFromLazy(loadPromise);
      return loadPromise;
    };
    let component: { readonly value: typeof componentExport } | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        initializeLazyAsyncScope("0");
        regsterAsyncGetterFromLazy(loadComponent);

        component = $computed(loadComponent);

        // The function is not declared with async syntax, so $computed must use
        // its lazy-loader marker to recognize the returned Promise.
        expect(executions).toBe(1);
        expect(isPending(component!)).toBe(true);
        expect(getAsyncValues()).toEqual({});

        // A lazy module load must not consume an ID that belongs to a real
        // async resource rendered inside the loaded component.
        expect(getAsyncID()).toBe("lazy:0:0");

        let boundaryPromise: Promise<unknown> | undefined;
        let readError: unknown;

        enterAsyncBoundary((promise) => {
          boundaryPromise = promise;
        });

        try {
          // oxlint-disable-next-line no-unused-expressions
          component!.value;
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(NotReadyError);
        expect(boundaryPromise).toBe(loadPromise);
        expect(isPromiseFromLazy(boundaryPromise!)).toBe(true);
        expect(windowValues[ASYNC_DATA_SSR_KEY]).toBe(serverSnapshot);
      });

      await loadPromise;

      runWithOwner(owner, () => {
        expect(component!.value).toBe(componentExport);
        expect(isPending(component!)).toBe(false);
      });
    } finally {
      delete windowValues[ASYNC_DATA_SSR_KEY];
      disposeOwner(owner);
    }
  });

  it("keeps nested lazy IDs stable when sibling parents resolve out of order", () => {
    const root = createOwner(null);
    const firstParent = createOwner(root);
    const secondParent = createOwner(root);

    runWithOwner(root, initializeLazyContext);

    let firstID = "";
    let secondID = "";
    let firstChildID = "";
    let secondChildID = "";

    runWithOwner(firstParent, () => {
      firstID = getLazyID();
      initializeLazyScope(firstID);
    });

    runWithOwner(secondParent, () => {
      secondID = getLazyID();
      initializeLazyScope(secondID);
    });

    // Deliberately create the second parent's descendants first.
    runWithOwner(secondParent, () => {
      secondChildID = getLazyID();
    });

    runWithOwner(firstParent, () => {
      firstChildID = getLazyID();
    });

    expect(firstID).toBe("0");
    expect(secondID).toBe("1");
    expect(firstChildID).toBe("0.0");
    expect(secondChildID).toBe("1.0");

    disposeOwner(root);
  });

  it("uses an independent async-data sequence for each lazy instance", () => {
    const root = createOwner(null);
    const firstLazy = createOwner(root);
    const secondLazy = createOwner(root);

    runWithOwner(root, initializeAsyncContext);

    runWithOwner(firstLazy, () => initializeLazyAsyncScope("0"));
    runWithOwner(secondLazy, () => initializeLazyAsyncScope("1"));

    let firstID = "";
    let firstNextID = "";
    let secondID = "";
    let rootID = "";

    // Reverse the module resolution order.
    runWithOwner(secondLazy, () => {
      secondID = getAsyncID();
      getAsyncValues()![secondID] = "second";
    });

    runWithOwner(firstLazy, () => {
      firstID = getAsyncID();
      firstNextID = getAsyncID();
      getAsyncValues()![firstID] = "first";
    });

    runWithOwner(root, () => {
      rootID = getAsyncID();
    });

    expect(firstID).toBe("lazy:0:0");
    expect(firstNextID).toBe("lazy:0:1");
    expect(secondID).toBe("lazy:1:0");
    expect(rootID).toBe("root:0");

    runWithOwner(root, () => {
      expect(getAsyncValues()).toMatchObject({
        "lazy:0:0": "first",
        "lazy:1:0": "second",
      });
    });

    disposeOwner(root);
  });

  it("tracks async and lazy IDs consumed by descendants skipped by an ErrorBoundary", () => {
    const serverRoot = createOwner(null);
    const serverBoundary = createOwner(serverRoot);
    const tracker = createHydrationIDTracker();

    runWithOwner(serverRoot, () => {
      initializeAsyncContext();
      initializeLazyContext();
    });

    runWithOwner(serverBoundary, () => {
      enterHydrationIDTracker(tracker);

      expect(getAsyncID()).toBe("root:0");
      expect(getLazyID()).toBe("0");

      const nestedLazy = createOwner(serverBoundary);
      runWithOwner(nestedLazy, () => {
        initializeLazyScope("skipped");
        initializeLazyAsyncScope("skipped");

        expect(getLazyID()).toBe("skipped.0");
        expect(getAsyncID()).toBe("lazy:skipped:0");
        expect(getAsyncID()).toBe("lazy:skipped:1");
      });
    });

    const { asyncIDs, lazyIDs } = getHydrationIDReservations(tracker);

    expect(asyncIDs).toEqual({
      root: 1,
      "lazy:skipped": 2,
    });
    expect(lazyIDs).toEqual({
      "": 1,
      skipped: 1,
    });

    const clientRoot = createOwner(null);
    const clientBoundary = createOwner(clientRoot);

    runWithOwner(clientRoot, () => {
      initializeAsyncContext();
      initializeLazyContext();
    });
    runWithOwner(clientBoundary, () => {
      reserveAsyncIDReservations(asyncIDs);
      reserveLazyIDReservations(lazyIDs);

      // Both root allocators skip IDs created by the rejected child.
      expect(getAsyncID()).toBe("root:1");
      expect(getLazyID()).toBe("1");

      const laterLazy = createOwner(clientBoundary);
      runWithOwner(laterLazy, () => {
        initializeLazyScope("skipped");
        initializeLazyAsyncScope("skipped");

        // Nested lazy scopes restore their own cursors when initialized.
        expect(getLazyID()).toBe("skipped.1");
        expect(getAsyncID()).toBe("lazy:skipped:2");
      });
    });

    disposeOwner(serverRoot);
    disposeOwner(clientRoot);
  });

  it("restores async ID reservations when hydrating an ErrorBoundary fallback", () => {
    const root = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;

    windowValues[ERROR_BOUNDARY_DATA_SSR_KEY] = [
      {
        status: "fallback",
        name: "Error",
        message: "server-side failure",
        asyncIDs: {
          root: 1,
          "lazy:skipped": 2,
        },
        lazyIDs: {
          "": 1,
          skipped: 2,
        },
      },
    ];

    try {
      runWithOwner(root, () => {
        initializeAsyncContext();
        initializeLazyContext();
        initializeErrorBoundaryContext();

        ErrorBoundary({
          children: "This subtree is skipped during hydration" as never,
          fallback: () => "Fallback",
        });

        expect(getAsyncID()).toBe("root:1");
        expect(getLazyID()).toBe("1");

        const skippedLazy = createOwner(root);
        runWithOwner(skippedLazy, () => {
          initializeLazyScope("skipped");
          expect(getLazyID()).toBe("skipped.2");

          initializeLazyAsyncScope("skipped");
          expect(getAsyncID()).toBe("lazy:skipped:2");
        });
      });
    } finally {
      delete windowValues[ERROR_BOUNDARY_DATA_SSR_KEY];
      disposeOwner(root);
    }
  });

  it("restores serialized falsy async values instead of rerunning their getter", () => {
    const root = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;
    windowValues[ASYNC_DATA_SSR_KEY] = {
      "lazy:0:0": false,
    };

    let hydrationValue: ReturnType<typeof getAsyncValue<boolean>> | undefined;

    runWithOwner(root, () => {
      initializeAsyncContext();
      initializeLazyAsyncScope("0");
      hydrationValue = getAsyncValue<boolean>(getAsyncID());
    });

    expect(hydrationValue).toEqual({
      found: true,
      value: false,
    });
    expect(windowValues[ASYNC_DATA_SSR_KEY]).toEqual({});

    delete windowValues[ASYNC_DATA_SSR_KEY];
    disposeOwner(root);
  });
});
