// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Catch } from "../src/components/catch";
import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import { initializeErrorBoundaryContext } from "../src/context/error-boundary";
import {
  createHydrationIDTracker,
  enterHydrationIDTracker,
  getHydrationIDReservations,
} from "../src/context/hydration-id-context";
import {
  getLazyID,
  initializeLazyContext,
  initializeLazyScope,
  reserveLazyIDReservations,
} from "../src/context/lazy-context";
import {
  createOwner,
  disposeOwner,
  reserveOwnerIDReservations,
  runWithOwner,
} from "../src/life-cycle/owner";

describe("owner and lazy hydration identities", () => {
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

  it("tracks owner and lazy ID reservations for descendants skipped by an Catch", () => {
    const serverRoot = createOwner(null);
    const serverBoundary = createOwner(serverRoot);
    const tracker = createHydrationIDTracker();

    runWithOwner(serverRoot, () => {
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
});
