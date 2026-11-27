import { describe, expect, it } from "vitest";

import {
  deserializeAsyncHydrationValue,
  serializeAsyncHydrationValue,
} from "../src/runtime/async/serialization";

describe("async hydration serialization", () => {
  it("keeps ordinary JSON values in their native shape", () => {
    const value = {
      count: 1351,
      next: "https://example.test/pokemon/?offset=20",
      previous: null,
      results: [
        { name: "bulbasaur", url: "https://example.test/pokemon/1/" },
        { name: "ivysaur", url: "https://example.test/pokemon/2/" },
      ],
    };

    const encoded = serializeAsyncHydrationValue(value);

    expect(encoded).toEqual(value);
    expect(deserializeAsyncHydrationValue(encoded)).toEqual(value);
  });

  it("preserves null-prototype records with tagged encoding", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.name = "Vynn";

    const encoded = serializeAsyncHydrationValue(value);
    const decoded = deserializeAsyncHydrationValue(encoded) as Record<string, unknown>;

    expect(Array.isArray(encoded) && encoded[1] === "tagged").toBe(true);
    expect(Object.getPrototypeOf(decoded)).toBeNull();
    expect(decoded.name).toBe("Vynn");
  });

  it("uses tagged encoding for special JavaScript values", () => {
    const value = {
      date: new Date("2026-11-23T00:00:00.000Z"),
      map: new Map([["count", 2]]),
      missing: undefined,
      notANumber: Number.NaN,
      negativeZero: -0,
      bigint: 9007199254740993n,
    };

    const encoded = serializeAsyncHydrationValue(value);
    const decoded = deserializeAsyncHydrationValue(encoded) as typeof value;

    expect(Array.isArray(encoded) && encoded[1] === "tagged").toBe(true);
    expect(decoded.date).toEqual(value.date);
    expect(decoded.map).toEqual(value.map);
    expect(decoded).toHaveProperty("missing", undefined);
    expect(decoded.notANumber).toBeNaN();
    expect(Object.is(decoded.negativeZero, -0)).toBe(true);
    expect(decoded.bigint).toBe(value.bigint);
  });

  it("escapes JSON values that collide with the hydration envelope", () => {
    const value = ["$vynn:async", "tagged", ["string", "ordinary application data"]];

    const encoded = serializeAsyncHydrationValue(value);

    expect(encoded).toEqual(["$vynn:async", "json", value]);
    expect(deserializeAsyncHydrationValue(encoded)).toEqual(value);
  });

  it("falls back for sparse arrays and preserves their holes", () => {
    const value = new Array(3);
    value[1] = "middle";

    const decoded = deserializeAsyncHydrationValue(
      serializeAsyncHydrationValue(value),
    ) as unknown[];

    expect(decoded).toHaveLength(3);
    expect(0 in decoded).toBe(false);
    expect(decoded[1]).toBe("middle");
    expect(2 in decoded).toBe(false);
  });
});
