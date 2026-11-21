// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { ASYNC_DATA_SSR_KEY } from "../src/const";
import {
  ASYNC_OWNER_ID_RESERVATIONS_KEY,
  initializeAsyncContext,
} from "../src/context/async-context";
import { setRenderMode } from "../src/context/render-mode";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { NotReadyError } from "../src/reactivity/not-ready-error";
import { isPending } from "../src/reactivity/pending";
import { $state, type State } from "../src/reactivity/state";
import { $store, type Store } from "../src/reactivity/store";
import { serializeServerFunctionValue } from "../src/server-functions/serialization";
import { renderAsyncUtilities } from "../src/server/render-to-server.util";
import {
  importedAsyncInitializer,
  importedSyncInitializer,
} from "./fixtures/state-initializers";

describe("Promise-returning initializers", () => {
  it("evaluates an imported synchronous initializer immediately", () => {
    const owner = createOwner(null);

    try {
      runWithOwner(owner, () => {
        const value = $state(importedSyncInitializer);

        expect(value.value).toBe(7);
        expect(owner.children).toEqual([]);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("promotes an imported Promise-returning initializer at runtime", async () => {
    const owner = createOwner(null);
    let value!: State<number>;
    let pendingPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        value = $state(importedAsyncInitializer);

        expect(isPending(value)).toBe(true);

        try {
          value.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          pendingPromise = (error as NotReadyError).promise;
        }
      });

      expect(pendingPromise).toBeDefined();
      await pendingPromise;

      runWithOwner(owner, () => {
        expect(value.value).toBe(42);
        expect(isPending(value)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("keeps a manual value when it is assigned before async resource loading finishes", async () => {
    const owner = createOwner(null);
    let value!: State<number>;
    let loadingPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        value = $state(() => new Promise<number>(() => {}));

        try {
          value.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          loadingPromise = (error as NotReadyError).promise;
        }

        value.value = 12;
        expect(value.value).toBe(12);
        expect(isPending(value)).toBe(false);
      });

      expect(loadingPromise).toBeDefined();
      await loadingPromise;

      runWithOwner(owner, () => {
        expect(value.value).toBe(12);
        expect(isPending(value)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("$state detects a Promise returned without the async keyword", async () => {
    const owner = createOwner(null);
    let count!: State<number>;
    let pendingPromise: Promise<unknown> | undefined;
    let executions = 0;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        count = $state(() => {
          executions += 1;
          return Promise.resolve(10);
        });

        expect(executions).toBe(1);
        expect(isPending(count)).toBe(true);

        try {
          count.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          pendingPromise = (error as NotReadyError).promise;
        }
      });

      expect(pendingPromise).toBeDefined();
      await pendingPromise;

      runWithOwner(owner, () => {
        expect(count.value).toBe(10);
        expect(isPending(count)).toBe(false);
      });

      expect(executions).toBe(1);
    } finally {
      disposeOwner(owner);
    }
  });

  it("$store detects a Promise returned without the async keyword", async () => {
    const owner = createOwner(null);
    let store!: Store<{ count: number }>;
    let pendingPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        store = $store(() => Promise.resolve({ count: 1 }));

        expect(isPending(store)).toBe(true);

        try {
          store.count;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          pendingPromise = (error as NotReadyError).promise;
        }
      });

      expect(pendingPromise).toBeDefined();
      await pendingPromise;

      runWithOwner(owner, () => {
        expect(store.count).toBe(1);
        expect(isPending(store)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("does not probe an initializer when its hydration ID has no serialized value", async () => {
    const globalWindow = window as unknown as Record<string, unknown>;
    const hadPreviousPayload = Object.prototype.hasOwnProperty.call(
      globalWindow,
      ASYNC_DATA_SSR_KEY,
    );
    const previousPayload = globalWindow[ASYNC_DATA_SSR_KEY];
    const owner = createOwner(null);
    let firstRuns = 0;
    let secondRuns = 0;
    let first!: State<number>;
    let second!: State<number>;

    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "01": serializeServerFunctionValue(42),
    };

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        first = $state(() => {
          firstRuns += 1;
          return Promise.resolve(10);
        });

        second = $state(() => {
          secondRuns += 1;
          return Promise.resolve(42);
        });

        expect(isPending(first)).toBe(true);
        expect(firstRuns).toBe(1);
        expect(second.value).toBe(42);
        expect(secondRuns).toBe(1);
        expect(isPending(second)).toBe(false);
      });

      await Promise.resolve();

      runWithOwner(owner, () => {
        expect(first.value).toBe(10);
      });
    } finally {
      disposeOwner(owner);

      if (hadPreviousPayload) {
        globalWindow[ASYNC_DATA_SSR_KEY] = previousPayload;
      } else {
        delete globalWindow[ASYNC_DATA_SSR_KEY];
      }
    }
  });

  it("allocates nested async owner IDs beneath a maybe-async initializer", async () => {
    const owner = createOwner(null);
    let parent!: State<number>;
    let child!: State<number>;
    let parentPromise: Promise<unknown> | undefined;
    let childPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        parent = $state(() => {
          child = $state(async () => 2);
          return Promise.resolve(1);
        });

        expect(owner.children.map((item) => item.id)).toEqual(["00"]);
        expect(owner.children[0]?.children.map((item) => item.id)).toEqual(["000"]);

        try {
          parent.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          parentPromise = (error as NotReadyError).promise;
        }

        try {
          child.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          childPromise = (error as NotReadyError).promise;
        }
      });

      expect(parentPromise).toBeDefined();
      expect(childPromise).toBeDefined();
      await Promise.all([parentPromise, childPromise]);

      runWithOwner(owner, () => {
        expect(parent.value).toBe(1);
        expect(child.value).toBe(2);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("preserves nested owner IDs when a maybe-async initializer resumes after NotReadyError", async () => {
    const owner = createOwner(null);
    let dependency!: State<number>;
    let parent!: State<number>;
    let child!: State<number>;
    let sibling!: State<number>;
    let parentPromise: Promise<unknown> | undefined;
    let siblingPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        dependency = $state(async () => 1);

        parent = $state(() => {
          const value = dependency.value;
          child = $state(async () => value + 1);
          return Promise.resolve(value + 2);
        });

        try {
          parent.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          parentPromise = (error as NotReadyError).promise;
        }

        // The suspended parent must commit its tentative slot before a
        // following sibling allocates an identity.
        sibling = $state(async () => 4);

        try {
          sibling.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          siblingPromise = (error as NotReadyError).promise;
        }

        expect(owner.children.map((item) => item.id)).toEqual(["00", "01", "02"]);
        expect(owner.children.find((item) => item.id === "01")?.children).toEqual([]);
      });

      expect(parentPromise).toBeDefined();
      expect(siblingPromise).toBeDefined();
      await Promise.all([parentPromise, siblingPromise]);
      await Promise.resolve();

      runWithOwner(owner, () => {
        const parentOwner = owner.children.find((item) => item.id === "01");

        expect(parentOwner?.children.map((item) => item.id)).toEqual(["010"]);
        expect(parent.value).toBe(3);
        expect(child.value).toBe(2);
        expect(sibling.value).toBe(4);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("keeps the identity scope for nested resources in a synchronous initializer", async () => {
    const owner = createOwner(null);
    let parent!: State<number>;
    let child!: State<number>;
    let childPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        parent = $state(() => {
          child = $state(async () => 2);
          return 1;
        });

        expect(parent.value).toBe(1);
        expect(owner.children.map((item) => item.id)).toEqual(["00"]);
        expect(owner.children[0]?.children.map((item) => item.id)).toEqual(["000"]);

        try {
          child.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          childPromise = (error as NotReadyError).promise;
        }
      });

      expect(childPromise).toBeDefined();
      await childPromise;

      runWithOwner(owner, () => {
        expect(child.value).toBe(2);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("hydrates an ownerless Promise-returning initializer on its first read", () => {
    const globalWindow = window as unknown as Record<string, unknown>;
    const hadPreviousPayload = Object.prototype.hasOwnProperty.call(
      globalWindow,
      ASYNC_DATA_SSR_KEY,
    );
    const previousPayload = globalWindow[ASYNC_DATA_SSR_KEY];
    const count = $state(() => Promise.resolve(42));
    const owner = createOwner(null);

    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "00": serializeServerFunctionValue(42),
    };

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        expect(count.value).toBe(42);
        expect(isPending(count)).toBe(false);
        expect(owner.children.map((child) => child.id)).toEqual([]);
        expect(owner.nodeCount).toBe(1);
      });
    } finally {
      disposeOwner(owner);

      if (hadPreviousPayload) {
        globalWindow[ASYNC_DATA_SSR_KEY] = previousPayload;
      } else {
        delete globalWindow[ASYNC_DATA_SSR_KEY];
      }
    }
  });

  it("preserves owner IDs when a server suspension hydrates synchronously", async () => {
    const globalWindow = window as unknown as Record<string, unknown>;
    const hadPreviousPayload = Object.prototype.hasOwnProperty.call(
      globalWindow,
      ASYNC_DATA_SSR_KEY,
    );
    const previousPayload = globalWindow[ASYNC_DATA_SSR_KEY];
    const serverOwner = createOwner(null);
    let dependencyPromise: Promise<unknown> | undefined;
    let siblingPromise: Promise<unknown> | undefined;
    let serverPayload: Record<string, unknown> | undefined;

    try {
      runWithOwner(serverOwner, () => {
        setRenderMode("sync");
        initializeAsyncContext();

        const dependency = $state(async () => 1);
        const parent = $state(() => dependency.value + 1);

        try {
          parent.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          dependencyPromise = (error as NotReadyError).promise;
        }

        const sibling = $state(async () => 4);

        try {
          sibling.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          siblingPromise = (error as NotReadyError).promise;
        }

        expect(serverOwner.children.map((item) => item.id)).toEqual(["00", "01", "02"]);
      });

      expect(dependencyPromise).toBeDefined();
      expect(siblingPromise).toBeDefined();
      await Promise.all([dependencyPromise, siblingPromise]);
      await Promise.resolve();

      runWithOwner(serverOwner, () => {
        const rendered = renderAsyncUtilities();
        const encodedValues = rendered.match(/\$AD=(.*?);\$EBD=/)?.[1];

        expect(encodedValues).toBeDefined();
        serverPayload = JSON.parse(encodedValues!) as Record<string, unknown>;
        expect(serverPayload[ASYNC_OWNER_ID_RESERVATIONS_KEY]).toEqual(["01"]);
      });

      const clientOwner = createOwner(null);
      globalWindow[ASYNC_DATA_SSR_KEY] = serverPayload;

      try {
        runWithOwner(clientOwner, () => {
          initializeAsyncContext();

          const dependency = $state(async () => 1);
          const parent = $state(() => dependency.value + 1);
          const sibling = $state(async () => 4);

          // The client hydrates the dependency immediately, so the parent
          // returns synchronously and must use the server-reserved slot.
          expect(dependency.value).toBe(1);
          expect(parent.value).toBe(2);
          expect(sibling.value).toBe(4);
          expect(clientOwner.children.map((item) => item.id)).toEqual(["00", "01", "02"]);
        });
      } finally {
        disposeOwner(clientOwner);
      }
    } finally {
      disposeOwner(serverOwner);

      if (hadPreviousPayload) {
        globalWindow[ASYNC_DATA_SSR_KEY] = previousPayload;
      } else {
        delete globalWindow[ASYNC_DATA_SSR_KEY];
      }
    }
  });

  it("does not consume a hydration ID for a synchronous initializer", () => {
    const globalWindow = window as unknown as Record<string, unknown>;
    const hadPreviousPayload = Object.prototype.hasOwnProperty.call(
      globalWindow,
      ASYNC_DATA_SSR_KEY,
    );
    const previousPayload = globalWindow[ASYNC_DATA_SSR_KEY];
    const owner = createOwner(null);
    let count!: State<number>;
    let executions = 0;

    globalWindow[ASYNC_DATA_SSR_KEY] = {
      "00": serializeServerFunctionValue(42),
    };

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        const synchronous = $state(() => 41);

        // A synchronous callback returns an ordinary cell and leaves the
        // parent's next hydration identity untouched.
        expect(synchronous.value).toBe(41);
        expect(owner.children).toEqual([]);
        expect(owner.nodeCount).toBe(0);

        count = $state(() => {
          executions += 1;
          return Promise.resolve(42);
        });

        expect(count.value).toBe(42);
        expect(executions).toBe(1);
        expect(isPending(count)).toBe(false);

        expect(owner.children.map((child) => child.id)).toEqual(["00"]);
        expect(owner.nodeCount).toBe(1);
      });
    } finally {
      disposeOwner(owner);

      if (hadPreviousPayload) {
        globalWindow[ASYNC_DATA_SSR_KEY] = previousPayload;
      } else {
        delete globalWindow[ASYNC_DATA_SSR_KEY];
      }
    }
  });

  it("re-runs a promoted initializer if a dependency changes while the resource chunk loads", async () => {
    const owner = createOwner(null);
    const resolvers = new Map<number, (value: number) => void>();
    let source!: State<number>;
    let value!: State<number>;
    let pendingPromise: Promise<unknown> | undefined;
    let notifySecondExecution!: () => void;
    const secondExecution = new Promise<void>((resolve) => {
      notifySecondExecution = resolve;
    });
    let executions = 0;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        source = $state(0);

        value = $state(() => {
          executions++;
          const current = source.value;
          if (current === 1) notifySecondExecution();

          return new Promise<number>((resolve) => {
            resolvers.set(current, resolve);
          });
        });

        source.value = 1;

        try {
          value.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          pendingPromise = (error as NotReadyError).promise;
        }
      });

      expect(pendingPromise).toBeDefined();
      await secondExecution;

      expect(executions).toBe(2);
      expect(resolvers.has(1)).toBe(true);

      resolvers.get(1)?.(1);
      await pendingPromise;

      runWithOwner(owner, () => {
        expect(value.value).toBe(1);
        expect(isPending(value)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });
});
