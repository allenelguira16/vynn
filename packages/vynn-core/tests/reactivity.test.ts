// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ASYNC_DATA_SSR_KEY } from "../src/const";
import { enterAsyncBoundary, getAsyncValues, initializeAsyncContext } from "../src/context/async-context";
import { isPromiseFromLazy, regsterAsyncGetterFromLazy } from "../src/context/lazy-context";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $async, isPending } from "../src/reactivity/$async";
import { $computed } from "../src/reactivity/$computed";
import { $effect } from "../src/reactivity/$effect";
import { $state } from "../src/reactivity/$state";
import { $store } from "../src/reactivity/$store";
import { NotReadyError } from "../src/reactivity/not-ready-error";
import { transaction } from "../src/reactivity/transaction";
import { untrack } from "../src/reactivity/untrack";
import { sleep } from "../src/utils/sleep";

async function flushEffects() {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

describe("$state", () => {
  it("stores and updates a value", () => {
    const count = $state(0);

    expect(count.value).toBe(0);

    count.value = 1;

    expect(count.value).toBe(1);
  });

  it("reruns effects when the value changes", async () => {
    const count = $state(0);
    const values: number[] = [];

    const dispose = $effect(() => {
      values.push(count.value);
    });

    try {
      expect(values).toEqual([0]);

      count.value = 1;
      await flushEffects();

      expect(values).toEqual([0, 1]);

      // Unchanged values should not trigger another execution.
      count.value = 1;
      await flushEffects();

      expect(values).toEqual([0, 1]);
    } finally {
      dispose();
    }
  });

  it("does not track with untrack", async () => {
    const count = $state(0);
    const values: number[] = [];

    const dispose = $effect(() => {
      untrack(() => {
        values.push(count.value);
      });
    });

    try {
      expect(values).toEqual([0]);

      count.value = 1;
      await flushEffects();

      expect(values).toEqual([0]);
    } finally {
      dispose();
    }
  });
});

describe("$computed", () => {
  it("evaluates eagerly, memoizes its value, and updates synchronously", () => {
    const firstName = $state("Ada");
    let executions = 0;

    const greeting = $computed(() => {
      executions += 1;
      return `Hello, ${firstName.value}!`;
    });

    expect(executions).toBe(1);
    expect(greeting.value).toBe("Hello, Ada!");
    expect(greeting.value).toBe("Hello, Ada!");
    expect(executions).toBe(1);

    firstName.value = "Grace";

    expect(executions).toBe(2);
    expect(greeting.value).toBe("Hello, Grace!");
    expect(executions).toBe(2);
  });

  it("registers a pending async dependency with the consuming Await boundary", async () => {
    const owner = createOwner(null);
    let greeting: { readonly value: string } | undefined;
    let boundaryPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        const name = $async(async () => "Ada");
        greeting = $computed(() => `Hello, ${name.value}!`);
      });

      runWithOwner(owner, () => {
        enterAsyncBoundary((promise) => {
          boundaryPromise = promise;
        });

        expect(() => greeting!.value).toThrow(NotReadyError);
        expect(isPending(greeting!)).toBe(true);
      });

      expect(boundaryPromise).toBeDefined();
      await boundaryPromise;

      runWithOwner(owner, () => {
        expect(greeting!.value).toBe("Hello, Ada!");
        expect(isPending(greeting!)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("starts asynchronous computations immediately", async () => {
    let executions = 0;

    const doubled = $computed(async () => {
      executions += 1;
      return 42;
    });

    expect(executions).toBe(1);
    expect(isPending(doubled)).toBe(true);

    await Promise.resolve();

    expect(doubled.value).toBe(42);
    expect(isPending(doubled)).toBe(false);
  });

  it("marks the async promise returned by a lazy computed getter", async () => {
    const owner = createOwner(null);
    let value: { readonly value: number } | undefined;
    let resolveValue!: (value: number) => void;
    let boundaryPromise: Promise<unknown> | undefined;

    const getter = async () =>
      new Promise<number>((resolve) => {
        resolveValue = resolve;
      });

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();
        regsterAsyncGetterFromLazy(getter);
        value = $computed(getter);
      });

      runWithOwner(owner, () => {
        enterAsyncBoundary((promise) => {
          boundaryPromise = promise;
        });

        expect(() => value!.value).toThrow(NotReadyError);
      });

      expect(boundaryPromise).toBeDefined();
      expect(isPromiseFromLazy(boundaryPromise!)).toBe(true);

      resolveValue(42);
      await boundaryPromise;

      runWithOwner(owner, () => {
        expect(value!.value).toBe(42);
      });
    } finally {
      disposeOwner(owner);
    }
  });
});

describe("$store", () => {
  it("tracks nested property changes", async () => {
    const user = $store({
      profile: {
        name: "Ada",
      },
    });

    const names: string[] = [];

    const dispose = $effect(() => {
      names.push(user.profile.name);
    });

    try {
      expect(names).toEqual(["Ada"]);

      user.profile.name = "Grace";
      await flushEffects();

      expect(names).toEqual(["Ada", "Grace"]);
    } finally {
      dispose();
    }
  });

  it("tracks getters as computed", async () => {
    const state = $store({
      single: 0,
      get double() {
        return this.single * 2;
      },
    });

    state.single = 10;

    expect(state.double).toEqual(20);
  });

  it("stores and runs functions as methods", async () => {
    const state = $store({
      number: 0,
      update(newNumber: number) {
        this.number = newNumber;
      },
    });

    state.update(20);

    expect(state.number).toEqual(20);
  });

  it("updates properties inside an existing transaction", async () => {
    const state = $store({
      number: 0,
    });

    const values: number[] = [];

    const dispose = $effect(() => {
      values.push(state.number);
    });

    try {
      expect(values).toEqual([0]);

      transaction(() => {
        state.number = 10;
        state.number = 20;
      });

      await flushEffects();

      expect(state.number).toBe(20);

      // Both writes are batched into one effect execution.
      expect(values).toEqual([0, 20]);
    } finally {
      dispose();
    }
  });
});

describe("$async", () => {
  it("executes immediately when created inside a Vynn owner", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        let executions = 0;
        const data = $async(async () => {
          executions += 1;
          return "test";
        });

        expect(executions).toBe(1);
        expect(isPending(data)).toBe(true);

        let pendingPromise: Promise<unknown> | undefined;

        try {
          data.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          pendingPromise = (error as NotReadyError).promise;
        }

        expect(executions).toBe(1);

        // Additional reads share the same in-flight request.
        expect(() => data.value).toThrow(NotReadyError);
        expect(executions).toBe(1);

        await pendingPromise;

        expect(data.value).toBe("test");
        expect(executions).toBe(1);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("retries an eager async resource when another async resource it reads resolves", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const dependency = $async(async () => 21);
        let executions = 0;

        const doubled = $async(async () => {
          executions += 1;
          return dependency.value * 2;
        });

        expect(executions).toBe(1);
        expect(isPending(dependency)).toBe(true);
        expect(isPending(doubled)).toBe(true);

        let dependencyPromise: Promise<unknown> | undefined;

        try {
          dependency.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          dependencyPromise = (error as NotReadyError).promise;
        }

        await dependencyPromise;
        await Promise.resolve();

        expect(doubled.value).toBe(42);
        expect(isPending(doubled)).toBe(false);
        expect(executions).toBe(2);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("keeps a manual assignment over an eager request", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        let executions = 0;
        const data = $async(async () => {
          executions += 1;
          return "getter value";
        });

        expect(executions).toBe(1);
        expect(isPending(data)).toBe(true);

        data.value = "manual value";

        expect(data.value).toBe("manual value");
        expect(executions).toBe(1);
        expect(isPending(data)).toBe(false);

        // The older in-flight result must not overwrite the manual value.
        await Promise.resolve();

        expect(data.value).toBe("manual value");
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("restores an eager resource from its SSR snapshot without repeating the request", async () => {
    const owner = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;
    windowValues[ASYNC_DATA_SSR_KEY] = {
      "root:0": 10,
    };

    let source: { value: number } | undefined;
    let data: { value: number } | undefined;
    let executions = 0;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        source = $state(1);
        data = $async(() => {
          executions += 1;
          return Promise.resolve(source!.value);
        });

        // The tracking pass runs eagerly, but hydration supplies the value
        // and prevents the original request from being repeated.
        expect(executions).toBe(1);
        expect(data!.value).toBe(10);
      });

      expect(windowValues[ASYNC_DATA_SSR_KEY]).toEqual({});

      runWithOwner(owner, () => {
        source!.value = 2;
      });

      await Promise.resolve();

      runWithOwner(owner, () => {
        expect(data!.value).toBe(2);
      });
      expect(executions).toBe(2);
    } finally {
      delete windowValues[ASYNC_DATA_SSR_KEY];
      disposeOwner(owner);
    }
  });

  it("retains its hydration snapshot while an async dependency is still pending", async () => {
    const owner = createOwner(null);
    const windowValues = window as unknown as Record<string, unknown>;
    windowValues[ASYNC_DATA_SSR_KEY] = {
      "root:1": 99,
    };

    let dependency: { value: number } | undefined;
    let derived: { value: number } | undefined;
    let dependencyRequests = 0;
    let derivedGetterRuns = 0;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        dependency = $async(async () => {
          dependencyRequests += 1;
          return 2;
        });

        derived = $async(() => {
          derivedGetterRuns += 1;
          return Promise.resolve(dependency!.value * 2);
        });

        // The derived hydration pass waits on the dependency while retaining
        // its own serialized value for the retry.
        expect(isPending(dependency!)).toBe(true);
        expect(isPending(derived!)).toBe(true);
      });

      let dependencyPromise: Promise<unknown> | undefined;

      runWithOwner(owner, () => {
        try {
          dependency!.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          dependencyPromise = (error as NotReadyError).promise;
        }
      });

      await dependencyPromise;
      await Promise.resolve();

      runWithOwner(owner, () => {
        expect(dependency!.value).toBe(2);
        expect(derived!.value).toBe(99);
        expect(isPending(derived!)).toBe(false);
      });

      expect(dependencyRequests).toBe(1);
      expect(derivedGetterRuns).toBe(2);
      expect(windowValues[ASYNC_DATA_SSR_KEY]).toEqual({});
    } finally {
      delete windowValues[ASYNC_DATA_SSR_KEY];
      disposeOwner(owner);
    }
  });

  it("fetches data and tracks pending state", async () => {
    const isPendingSnapshots: boolean[] = [];
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const data = $async(async () => {
          await sleep(0);
          return "test";
        });

        const resolved = await new Promise<string>((resolve) => {
          $effect(() => {
            try {
              data.value;
            } catch (error) {
              if (!(error instanceof NotReadyError)) {
                throw error;
              }

              isPendingSnapshots.push(isPending(data));
              return;
            }

            isPendingSnapshots.push(isPending(data));
            resolve(data.value);
          });
        });

        expect(isPendingSnapshots).toEqual([true, false]);
        expect(resolved).toBe("test");
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("allows mutation after the async value resolves", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const data = $async(async () => {
          await sleep(0);
          return "test";
        });

        // Wait until reading data.value succeeds.
        await new Promise<void>((resolve) => {
          $effect(() => {
            // oxlint-disable
            data.value;
            resolve();
          });
        });

        expect(data.value).toBe("test");
        expect(isPending(data)).toBe(false);

        data.value = "new value";

        expect(data.value).toBe("new value");
        expect(isPending(data)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });


  it("works outside an owner and initialized async context", async () => {
    let executions = 0;
    const data = $async(async () => {
      executions += 1;
      return "standalone";
    });

    expect(executions).toBe(0);
    expect(isPending(data)).toBe(false);

    let pendingPromise: Promise<unknown> | undefined;

    try {
      data.value;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      pendingPromise = (error as NotReadyError).promise;
    }

    expect(executions).toBe(1);
    expect(isPending(data)).toBe(true);

    await pendingPromise;

    expect(data.value).toBe("standalone");
    expect(isPending(data)).toBe(false);
  });



  it("uses the consuming component's Await boundary when created outside an owner", async () => {
    const data = $async(async () => "standalone boundary");
    const owner = createOwner(null);
    let boundaryPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        enterAsyncBoundary((promise) => {
          boundaryPromise = promise;
        });

        expect(() => data.value).toThrow(NotReadyError);
      });

      expect(boundaryPromise).toBeDefined();
      await boundaryPromise;

      runWithOwner(owner, () => {
        expect(data.value).toBe("standalone boundary");
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("acquires hydration context when a standalone resource is first read in a render", async () => {
    const data = $async(async () => "rendered");
    const owner = createOwner(null);

    let pendingPromise: Promise<unknown> | undefined;

    try {
      runWithOwner(owner, () => {
        initializeAsyncContext();

        try {
          data.value;
        } catch (error) {
          expect(error).toBeInstanceOf(NotReadyError);
          pendingPromise = (error as NotReadyError).promise;
        }
      });

      await pendingPromise;

      runWithOwner(owner, () => {
        expect(data.value).toBe("rendered");
        expect(getAsyncValues()).toEqual({
          "root:0": "rendered",
        });
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("tracks dependencies when created outside an owner", async () => {
    const source = $state(1);
    const resolvers = new Map<number, (value: number) => void>();

    const data = $async(async () => {
      const id = source.value;

      return new Promise<number>((resolve) => {
        resolvers.set(id, resolve);
      });
    });

    let firstPromise: Promise<unknown> | undefined;

    try {
      data.value;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      firstPromise = (error as NotReadyError).promise;
    }

    resolvers.get(1)?.(10);
    await firstPromise;

    expect(data.value).toBe(10);

    source.value = 2;

    let secondPromise: Promise<unknown> | undefined;

    try {
      data.value;
    } catch (error) {
      expect(error).toBeInstanceOf(NotReadyError);
      secondPromise = (error as NotReadyError).promise;
    }

    expect(isPending(data)).toBe(true);

    resolvers.get(2)?.(20);
    await secondPromise;

    expect(data.value).toBe(20);
    expect(isPending(data)).toBe(false);
  });

  it("receives rejection", async () => {
    const owner = createOwner();
    const error = new Error("An Error Occured");

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const data = $async(async () => {
          throw error;
        });

        const resolved = await new Promise<Error>((resolve) => {
          $effect(() => {
            try {
              data.value;
            } catch (error) {
              if (error instanceof NotReadyError) {
                throw error;
              }

              resolve(error as Error);
            }
          });
        });

        expect(resolved).toBe(error);
      });
    } finally {
      disposeOwner(owner);
    }
  });
});


describe("async-derived $state", () => {
  it("is writable and refreshes only when a dependency changes", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const source = $state(1);
        const resolvers = new Map<number, (value: number) => void>();
        let executions = 0;

        const count = $state(async () => {
          executions += 1;
          const id = source.value;

          return new Promise<number>((resolve) => {
            resolvers.set(id, resolve);
          });
        });

        expect(executions).toBe(1);
        expect(isPending(count)).toBe(true);
        expect(() => count.value).toThrow(NotReadyError);

        resolvers.get(1)?.(0);
        await Promise.resolve();

        expect(count.value).toBe(0);
        expect(isPending(count)).toBe(false);

        count.value++;

        expect(count.value).toBe(1);
        expect(executions).toBe(1);

        source.value = 2;

        expect(executions).toBe(2);
        expect(isPending(count)).toBe(true);

        // A refresh keeps the previous resolved value readable.
        expect(count.value).toBe(1);

        resolvers.get(2)?.(20);
        await Promise.resolve();

        expect(count.value).toBe(20);
        expect(isPending(count)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("retains the last resolved value across a failed refresh and retry", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const source = $state(0);
        const resolvers = new Map<
          number,
          {
            resolve: (value: number) => void;
            reject: (error: unknown) => void;
          }
        >();

        const value = $state(async () => {
          const id = source.value;

          return new Promise<number>((resolve, reject) => {
            resolvers.set(id, { resolve, reject });
          });
        });

        resolvers.get(0)?.resolve(10);
        await Promise.resolve();

        expect(value.value).toBe(10);

        const error = new Error("Refresh failed");
        source.value = 1;
        resolvers.get(1)?.reject(error);
        await Promise.resolve();

        expect(() => value.value).toThrow(error);

        // The failed request does not discard the last successful snapshot.
        source.value = 2;
        expect(isPending(value)).toBe(true);
        expect(value.value).toBe(10);

        resolvers.get(2)?.resolve(20);
        await Promise.resolve();

        expect(value.value).toBe(20);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("ignores stale async results", async () => {
    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const source = $state(0);
        const resolvers = new Map<number, (value: number) => void>();

        const value = $state(async () => {
          const id = source.value;

          return new Promise<number>((resolve) => {
            resolvers.set(id, resolve);
          });
        });

        expect(resolvers.size).toBe(1);

        source.value = 1;

        expect(resolvers.size).toBe(2);

        resolvers.get(1)?.(1);
        await Promise.resolve();

        expect(value.value).toBe(1);

        // A slower result from the previous dependency value cannot win.
        resolvers.get(0)?.(0);
        await Promise.resolve();

        expect(value.value).toBe(1);
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("preserves synchronous function values", () => {
    const callback = () => 42;
    const state = $state(callback);

    expect(state.value).toBe(callback);
  });
});

describe("async-derived $store", () => {
  it("notifies collection consumers when a reconciled array keeps its identity", async () => {
    type Snapshot = {
      data: {
        results: Array<{
          name: string;
        }>;
      };
    };

    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const page = $state(1);
        const resolvers = new Map<number, (value: Snapshot) => void>();

        const store = $store<Snapshot>(async () => {
          const currentPage = page.value;

          return new Promise<Snapshot>((resolve) => {
            resolvers.set(currentPage, resolve);
          });
        });

        resolvers.get(1)?.({
          data: {
            results: [{ name: "bulbasaur" }],
          },
        });
        await Promise.resolve();

        const originalResults = store.data.results;
        const mappedNames: string[][] = [];
        const dispose = $effect(() => {
          // Match the dependency shape of a JSX .map() expression: subscribe
          // to the collection property, then destructure item fields.
          const results = store.data.results;
          mappedNames.push(results.map(({ name }) => name));
        });

        try {
          expect(mappedNames).toEqual([["bulbasaur"]]);

          page.value = 2;

          resolvers.get(2)?.({
            data: {
              results: [{ name: "ivysaur" }],
            },
          });
          await Promise.resolve();
          await flushEffects();

          expect(store.data.results).toBe(originalResults);
          expect(store.data.results[0].name).toBe("ivysaur");
          expect(mappedNames).toEqual([["bulbasaur"], ["ivysaur"]]);
        } finally {
          dispose();
        }
      });
    } finally {
      disposeOwner(owner);
    }
  });

  it("reconciles refreshes into the same deeply reactive store", async () => {
    type Snapshot = {
      id: number;
      profile: {
        name: string;
      };
      items: Array<{
        label: string;
      }>;
      stale?: boolean;
      active?: boolean;
    };

    const owner = createOwner();

    try {
      await runWithOwner(owner, async () => {
        initializeAsyncContext();

        const source = $state(1);
        const resolvers = new Map<number, (value: Snapshot) => void>();
        let executions = 0;

        const user = $store<Snapshot>(async () => {
          executions += 1;
          const id = source.value;

          return new Promise<Snapshot>((resolve) => {
            resolvers.set(id, resolve);
          });
        });

        const identity = user;

        expect(executions).toBe(1);
        expect(isPending(user)).toBe(true);
        expect(() => user.profile).toThrow(NotReadyError);

        resolvers.get(1)?.({
          id: 1,
          profile: { name: "Ada" },
          items: [{ label: "First" }],
          stale: true,
        });
        await Promise.resolve();

        expect(user.id).toBe(1);
        expect(user.profile.name).toBe("Ada");

        const profile = user.profile;
        const items = user.items;
        const firstItem = user.items[0];

        // Manual nested and root mutations remain ordinary store writes.
        user.id = 10;
        user.profile.name = "Local";

        expect(user.id).toBe(10);
        expect(user.profile.name).toBe("Local");
        expect(executions).toBe(1);

        source.value = 2;

        expect(executions).toBe(2);
        expect(isPending(user)).toBe(true);

        // Existing values stay available during refresh.
        expect(user.id).toBe(10);
        expect(user.profile.name).toBe("Local");

        resolvers.get(2)?.({
          id: 2,
          profile: { name: "Grace" },
          items: [{ label: "Updated" }],
          active: true,
        });
        await Promise.resolve();

        expect(user).toBe(identity);
        expect(user.profile).toBe(profile);
        expect(user.items).toBe(items);
        // Changed array entries get new identities so mapped component props
        // captured from destructured fields are recreated with fresh values.
        expect(user.items[0]).not.toBe(firstItem);
        expect(user.items[0].label).toBe("Updated");
        expect(user.id).toBe(2);
        expect(user.profile.name).toBe("Grace");
        expect(user.stale).toBeUndefined();
        expect(user.active).toBe(true);
        expect(isPending(user)).toBe(false);
      });
    } finally {
      disposeOwner(owner);
    }
  });
});


describe("async-derived state without an owner", () => {
  it("supports async $state and $store outside a component", async () => {
    const count = $state(async () => 42);
    const settings = $store(async () => ({
      theme: "dark",
      preferences: {
        compact: true,
      },
    }));

    expect(isPending(count)).toBe(true);
    expect(isPending(settings)).toBe(true);

    await Promise.resolve();

    expect(count.value).toBe(42);
    expect(settings.theme).toBe("dark");
    expect(settings.preferences.compact).toBe(true);
  });
});

