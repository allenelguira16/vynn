// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ASYNC_DATA_SSR_KEY } from "../src/const";
import {
  getAsyncID,
  getAsyncValue,
  getAsyncValues,
  initializeAsyncContext,
  initializeLazyAsyncScope,
} from "../src/context/async-context";
import {
  getLazyID,
  initializeLazyContext,
  initializeLazyScope,
} from "../src/context/lazy-context";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";

describe("lazy hydration identities", () => {
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
