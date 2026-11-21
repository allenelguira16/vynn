// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Catch } from "../src/components/client/catch";
import { ASYNC_DATA_SSR_KEY, ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import {
  enterAsyncBoundary,
  getAsyncValue,
  getAsyncValues,
  initializeAsyncContext,
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
import {
  createOwner,
  disposeOwner,
  reserveOwnerIDReservations,
  runWithOwner,
} from "../src/life-cycle/owner";
import { $computed } from "../src/reactivity/$computed";
import { isPending } from "../src/reactivity/async";
import { NotReadyError } from "../src/reactivity/not-ready-error";

describe("owner-based hydration identities", () => {
  it("encodes multi-digit owner indexes without path separators", () => {
    const root = createOwner(null);

    try {
      const children = Array.from({ length: 12 }, () => createOwner(root));
      const nested = createOwner(children[10]!);

      expect(root.id).toBe("0");
      expect(children.map((owner) => owner.id)).toEqual([
        "00",
        "01",
        "02",
        "03",
        "04",
        "05",
        "06",
        "07",
        "08",
        "09",
        "0a10",
        "0a11",
      ]);
      expect(nested.id).toBe("0a100");
      expect(new Set(children.map((owner) => owner.id)).size).toBe(children.length);
    } finally {
      disposeOwner(root);
    }
  });

  it("gives lazy loaders owner identities without serializing their promises", async () => {
    const owner = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;
    const serverSnapshot = { "00": "server-only-value" };
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
        regsterAsyncGetterFromLazy(loadComponent);

        component = $computed(loadComponent);

        // The loader still has a stable owner identity, but its module promise
        // is intentionally not serialized as an async resource value.
        expect(executions).toBe(1);
        expect(isPending(component!)).toBe(true);
        expect(owner.children[0]?.id).toBe("00");
        expect(getAsyncValues()).toEqual({});

        // The next real async resource gets the next owner slot.
        const realResource = $computed(async () => "real resource");
        expect(owner.children[1]?.id).toBe("01");

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

        return realResource;
      });

      await loadPromise;
      await Promise.resolve();

      runWithOwner(owner, () => {
        expect(component!.value).toBe(componentExport);
        expect(isPending(component!)).toBe(false);
        expect(getAsyncValues()).toEqual({ "01": "real resource" });
        expect(windowValues[ASYNC_DATA_SSR_KEY]).toBe(serverSnapshot);
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

    expect(firstParent.id).toBe("00");
    expect(secondParent.id).toBe("01");
    expect(firstID).toBe("0");
    expect(secondID).toBe("1");
    expect(firstChildID).toBe("0.0");
    expect(secondChildID).toBe("1.0");

    disposeOwner(root);
  });

  it("derives async hydration keys from each resource owner's hierarchy", async () => {
    const root = createOwner(null);
    const firstLazy = createOwner(root);
    const secondLazy = createOwner(root);

    runWithOwner(root, initializeAsyncContext);

    let firstID = "";
    let firstNextID = "";
    let secondID = "";
    let rootID = "";

    // Create the second lazy branch first to show that IDs depend on owner
    // structure, not on the order in which promises settle.
    runWithOwner(secondLazy, () => {
      $computed(async () => "second");
      secondID = secondLazy.children[0]!.id!;
    });

    runWithOwner(firstLazy, () => {
      $computed(async () => "first");
      $computed(async () => "first-next");
      firstID = firstLazy.children[0]!.id!;
      firstNextID = firstLazy.children[1]!.id!;
    });

    runWithOwner(root, () => {
      $computed(async () => "root");
      rootID = root.children[2]!.id!;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(firstLazy.id).toBe("00");
    expect(secondLazy.id).toBe("01");
    expect(firstID).toBe("000");
    expect(firstNextID).toBe("001");
    expect(secondID).toBe("010");
    expect(rootID).toBe("02");

    runWithOwner(root, () => {
      expect(getAsyncValues()).toMatchObject({
        "000": "first",
        "001": "first-next",
        "010": "second",
        "02": "root",
      });
    });

    disposeOwner(root);
  });

  it("tracks owner and lazy ID reservations for descendants skipped by an Catch", () => {
    const serverRoot = createOwner(null);
    const serverBoundary = createOwner(serverRoot);
    const tracker = createHydrationIDTracker();

    runWithOwner(serverRoot, () => {
      initializeAsyncContext();
      initializeLazyContext();
    });

    runWithOwner(serverBoundary, () => {
      enterHydrationIDTracker(tracker);

      expect(getLazyID()).toBe("0");

      const skippedChild = createOwner(serverBoundary);
      const nestedChild = createOwner(skippedChild);

      runWithOwner(nestedChild, () => {
        initializeLazyScope("skipped");
        expect(getLazyID()).toBe("skipped.0");
      });
    });

    const { ownerIDs, lazyIDs } = getHydrationIDReservations(tracker);

    expect(ownerIDs).toEqual({
      "00": 1,
      "000": 1,
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
      reserveOwnerIDReservations(ownerIDs);
      reserveLazyIDReservations(lazyIDs);

      // The skipped child occupied owner ID 000, so the next owner starts at 001.
      const laterChild = createOwner(clientBoundary);
      expect(laterChild.id).toBe("001");
      expect(getLazyID()).toBe("1");

      const laterLazy = createOwner(laterChild);
      runWithOwner(laterLazy, () => {
        initializeLazyScope("skipped");

        // Nested lazy scopes restore their independent cursor as well.
        expect(getLazyID()).toBe("skipped.1");
      });
    });

    disposeOwner(serverRoot);
    disposeOwner(clientRoot);
  });

  it("restores owner ID reservations when hydrating an Catch fallback", () => {
    const root = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;

    windowValues[ERROR_BOUNDARY_DATA_SSR_KEY] = [
      {
        status: "fallback",
        name: "Error",
        message: "server-side failure",
        ownerIDs: {
          "00": 1,
          "000": 1,
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

        Catch({
          children: "This subtree is skipped during hydration" as never,
          fallback: () => "Fallback",
        });

        const boundaryOwner = root.children.find((child) => child.id === "00");
        expect(boundaryOwner?.nodeCount).toBe(1);
        expect(getLazyID()).toBe("1");

        const skippedLazy = createOwner(boundaryOwner!);
        runWithOwner(skippedLazy, () => {
          initializeLazyScope("skipped");
          expect(getLazyID()).toBe("skipped.2");
        });
      });
    } finally {
      delete windowValues[ERROR_BOUNDARY_DATA_SSR_KEY];
      disposeOwner(root);
    }
  });

  it("restores serialized falsy async values using the resource owner's ID", () => {
    const root = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;
    windowValues[ASYNC_DATA_SSR_KEY] = {
      "00": false,
    };

    let hydrationValue: ReturnType<typeof getAsyncValue<boolean>> | undefined;

    runWithOwner(root, () => {
      initializeAsyncContext();
      const resourceOwner = createOwner();
      hydrationValue = getAsyncValue<boolean>(resourceOwner.id!);
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
