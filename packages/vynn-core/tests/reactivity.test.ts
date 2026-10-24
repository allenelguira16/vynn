// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { $state } from "../src/reactivity/$state";
import { $effect } from "../src/reactivity/$effect";
import { $computed } from "../src/reactivity/$computed";
import { $store } from "../src/reactivity/$store";
import { $async, isPending } from "../src/reactivity/$async";
import { transaction } from "../src/reactivity/transaction";
import { untrack } from "../src/reactivity/untrack";
import { sleep } from "../src/utils/sleep";
import { initializeAsyncContext } from "../src/context/async-context";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import { NotReadyError } from "../src/reactivity/not-ready-error";

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
  it("updates synchronously when dependencies change", () => {
    const firstName = $state("Ada");

    const greeting = $computed(() => `Hello, ${firstName.value}!`);

    expect(greeting.value).toBe("Hello, Ada!");

    firstName.value = "Grace";

    expect(greeting.value).toBe("Hello, Grace!");
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

              // console.log();
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
