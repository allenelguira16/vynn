// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Catch } from "../src/components/catch";
import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import { initializeErrorBoundaryContext } from "../src/context/error-boundary";
import {
  createOwner,
  disposeOwner,
  enterOwnerIDTracker,
  reserveOwnerIDReservations,
  runWithOwner,
} from "../src/life-cycle/owner";

describe("Owner hydration identities", () => {
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

  it("tracks nested identity slots allocated below a boundary", () => {
    const root = createOwner(null);
    const boundary = createOwner(root);
    const tracker = new Map<string, number>();

    try {
      runWithOwner(boundary, () => {
        enterOwnerIDTracker(tracker);

        const lazyOwner = createOwner();
        const nestedOwner = createOwner(lazyOwner);

        expect(lazyOwner.id).toBe("000");
        expect(nestedOwner.id).toBe("0000");
      });

      expect(Object.fromEntries(tracker)).toEqual({
        "00": 1,
        "000": 1,
      });
    } finally {
      disposeOwner(root);
    }
  });

  it("restores reserved child slots on an existing nested Owner", () => {
    const root = createOwner(null);
    const boundary = createOwner(root);
    const nestedOwner = createOwner(boundary);

    try {
      runWithOwner(nestedOwner, () => {
        reserveOwnerIDReservations({ "000": 1 });

        const nextChild = createOwner();
        expect(nextChild.id).toBe("0001");
      });
    } finally {
      disposeOwner(root);
    }
  });

  it("restores reserved Owner slots before rendering a Catch fallback", () => {
    const root = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;

    windowValues[ERROR_BOUNDARY_DATA_SSR_KEY] = [
      {
        status: "fallback",
        name: "Error",
        message: "server-side failure",
        ownerIDs: { "00": 1 },
      },
    ];

    try {
      runWithOwner(root, () => {
        initializeErrorBoundaryContext();

        Catch({
          children: "This subtree is skipped during hydration" as never,
          fallback: () => "Fallback",
        });

        const boundaryOwner = root.children?.find((child) => child.id === "00");
        expect(boundaryOwner?.nodeCount).toBe(1);

        const fallbackOwner = createOwner(boundaryOwner!, { identity: false });
        runWithOwner(fallbackOwner, () => {
          const fallbackChild = createOwner();
          expect(fallbackChild.id).toBe("001");
        });
      });
    } finally {
      delete windowValues[ERROR_BOUNDARY_DATA_SSR_KEY];
      disposeOwner(root);
    }
  });
});
