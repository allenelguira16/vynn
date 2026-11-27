// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Catch } from "../src/components/catch";
import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import { initializeErrorBoundaryContext } from "../src/context/error-boundary";
import {
  appendOwnerIdentityID,
  createOwner,
  disposeOwner,
  enterOwnerIDTracker,
  reserveOwnerIDReservations,
  runWithOwner,
} from "../src/life-cycle/owner";

describe("Owner hydration identities", () => {
  it("encodes owner indexes in base36 with explicit width markers", () => {
    const indexes = [0, 9, 10, 35, 36, 37, 1295, 1296];

    expect(indexes.map((index) => appendOwnerIdentityID("0", index))).toEqual([
      "0.",
      "09",
      "0a",
      "0z",
      "0A10",
      "0A11",
      "0Azz",
      "0B100",
    ]);
  });

  it("compresses nested zero-index runs without making path segments ambiguous", () => {
    const encodeZeroRun = (length: number) => {
      let id = "0";
      for (let index = 0; index < length; index++) {
        id = appendOwnerIdentityID(id, 0);
      }
      return id;
    };

    expect([1, 2, 3, 35, 36, 37].map(encodeZeroRun)).toEqual([
      "0.",
      "0..",
      "0~3",
      "0~z",
      "0~A10",
      "0~A11",
    ]);

    let id = appendOwnerIdentityID(encodeZeroRun(3), 1);
    id = appendOwnerIdentityID(id, 1);
    expect(id).toBe("0~311");

    id = appendOwnerIdentityID(id, 0);
    id = appendOwnerIdentityID(id, 0);
    id = appendOwnerIdentityID(id, 0);
    expect(id).toBe("0~311~3");

    id = "0";
    for (let index = 0; index < 6; index++) id = appendOwnerIdentityID(id, 0);
    id = appendOwnerIdentityID(id, 1);
    id = appendOwnerIdentityID(id, 1);
    for (let index = 0; index < 6; index++) id = appendOwnerIdentityID(id, 0);

    expect(id).toBe("0~611~6");
    expect(id.length).toBe(7);
  });

  it("allocates compact hierarchical Owner IDs", () => {
    const root = createOwner(null);

    try {
      const children = Array.from({ length: 38 }, () => createOwner(root));
      const nested = createOwner(children[10]!);

      expect(root.id).toBe("0");
      expect(children.slice(0, 10).map((owner) => owner.id)).toEqual([
        "0.",
        "01",
        "02",
        "03",
        "04",
        "05",
        "06",
        "07",
        "08",
        "09",
      ]);
      expect(children[10]?.id).toBe("0a");
      expect(children[35]?.id).toBe("0z");
      expect(children[36]?.id).toBe("0A10");
      expect(children[37]?.id).toBe("0A11");
      expect(nested.id).toBe("0a.");
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

        expect(lazyOwner.id).toBe("0..");
        expect(nestedOwner.id).toBe("0~3");
      });

      expect(Object.fromEntries(tracker)).toEqual({
        "0.": 1,
        "0..": 1,
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
        reserveOwnerIDReservations({ "0..": 1 });

        const nextChild = createOwner();
        expect(nextChild.id).toBe("0..1");
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
        ownerIDs: { "0.": 1 },
      },
    ];

    try {
      runWithOwner(root, () => {
        initializeErrorBoundaryContext();

        Catch({
          children: "This subtree is skipped during hydration" as never,
          fallback: () => "Fallback",
        });

        const boundaryOwner = root.children?.find((child) => child.id === "0.");
        expect(boundaryOwner?.nodeCount).toBe(1);

        const fallbackOwner = createOwner(boundaryOwner!, { identity: false });
        runWithOwner(fallbackOwner, () => {
          const fallbackChild = createOwner();
          expect(fallbackChild.id).toBe("0.1");
        });
      });
    } finally {
      delete windowValues[ERROR_BOUNDARY_DATA_SSR_KEY];
      disposeOwner(root);
    }
  });
});
