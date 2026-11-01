import { describe, expect, it, vi } from "vitest";
import {
  createOwner,
  getContext,
  getOwner,
  runWithOwner,
  setContext,
} from "../src/life-cycle/owner";

describe("owner module identity", () => {
  it("shares the active owner across separately evaluated module instances", async () => {
    const owner = createOwner(null);

    // Simulate the host server and Vite SSR runner loading separate copies
    // of the owner module in the same JavaScript realm.
    vi.resetModules();

    const duplicate = await import("../src/life-cycle/owner");
    const contextKey = Symbol("shared-owner-context");

    runWithOwner(owner, () => {
      expect(getOwner()).toBe(owner);
      expect(duplicate.getOwner()).toBe(owner);

      setContext(contextKey, "shared");
      expect(duplicate.getContext(contextKey)).toBe("shared");

      const child = duplicate.createOwner();
      expect(child.parent).toBe(owner);

      duplicate.runWithOwner(child, () => {
        expect(getOwner()).toBe(child);
        expect(duplicate.getOwner()).toBe(child);
      });

      expect(getOwner()).toBe(owner);
    });

    expect(getOwner()).toBeNull();
  });
});
