import { describe, expect, it } from "vitest";

import {
  getAsyncValues,
  initializeAsyncContext,
} from "../src/context/async-context";
import { runWithServerAsyncContext } from "../src/context/server-async-context";

describe("SSR async render context", () => {
  it("isolates async hydration registries across overlapping renders", async () => {
    const first = runWithServerAsyncContext(async () => {
      initializeAsyncContext();
      const values = getAsyncValues()!;
      values["0.0"] = "first";
      await Promise.resolve();
      values["0.1"] = "first-next";
      return { ...values };
    });

    const second = runWithServerAsyncContext(async () => {
      initializeAsyncContext();
      const values = getAsyncValues()!;
      values["0.0"] = "second";
      await Promise.resolve();
      return { ...values };
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { "0.0": "first", "0.1": "first-next" },
      { "0.0": "second" },
    ]);
  });
});
