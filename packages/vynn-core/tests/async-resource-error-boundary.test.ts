import { describe, expect, it } from "vitest";

import { initializeAsyncContext } from "../src/context/async-context";
import { enterErrorBoundary } from "../src/context/error-boundary-context";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { NotReadyError } from "../src/reactivity_new/not-ready-error";
import { createAsyncResource } from "../src/reactivity_new/resource";

describe("async resource error boundaries", () => {
  it("dispatches asynchronous rejections from the resource", async () => {
    const owner = createOwner(null);
    const failure = new Error("request failed");
    const boundaryErrors: Error[] = [];
    let resource!: ReturnType<typeof createAsyncResource<number>>;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        enterErrorBoundary((error) => boundaryErrors.push(error));

        resource = createAsyncResource(async () => {
          throw failure;
        });
      });

      await Promise.resolve();

      expect(boundaryErrors).toEqual([failure]);
      expect(runWithOwner(owner, () => resource.value)).toBeUndefined();
    } finally {
      disposeOwner(owner);
    }
  });

  it("keeps asynchronous rejections observable when no boundary exists", async () => {
    const owner = createOwner(null);
    const failure = new Error("unhandled request failure");
    let resource!: ReturnType<typeof createAsyncResource<number>>;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        resource = createAsyncResource(async () => {
          throw failure;
        });
      });

      await Promise.resolve();

      expect(() => runWithOwner(owner, () => resource.value)).toThrow(failure);
    } finally {
      disposeOwner(owner);
    }
  });

  it("captures the consuming boundary for a resource created outside an owner", async () => {
    const failure = new Error("module resource failed");
    const boundaryErrors: Error[] = [];
    const resource = createAsyncResource<number>(async () => {
      throw failure;
    });
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        enterErrorBoundary((error) => boundaryErrors.push(error));

        expect(() => resource.value).toThrow(NotReadyError);
      });

      await Promise.resolve();

      expect(boundaryErrors).toEqual([failure]);
      expect(runWithOwner(owner, () => resource.value)).toBeUndefined();
    } finally {
      disposeOwner(owner);
    }
  });

  it("handles synchronous getter failures inside the resource", () => {
    const owner = createOwner(null);
    const failure = new Error("getter failed");
    const boundaryErrors: Error[] = [];

    try {
      const resource = runWithOwner(owner, () => {
        initializeAsyncContext();
        enterErrorBoundary((error) => boundaryErrors.push(error));

        const getter = (() => {
          throw failure;
        }) as () => Promise<number>;

        return createAsyncResource(getter);
      });

      expect(boundaryErrors).toEqual([failure]);
      expect(runWithOwner(owner, () => resource.value)).toBeUndefined();
    } finally {
      disposeOwner(owner);
    }
  });
});
