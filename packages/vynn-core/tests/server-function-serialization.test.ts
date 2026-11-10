import { describe, expect, it } from "vitest";

import {
  deserializeServerFunctionValue,
  registerServerFunctionCodec,
  serializeServerFunctionValue,
} from "../src/server-functions/serialization.ts";

describe("server-function serialization", () => {
  it("round-trips common JavaScript built-in values", () => {
    const value = {
      date: new Date("2026-11-11T00:00:00.000Z"),
      url: new URL("https://example.test/path?q=vynn"),
      search: new URLSearchParams("tag=one&tag=two"),
      regexp: /vynn/gi,
      map: new Map([["count", 2]]),
      set: new Set(["a", "b"]),
      bigint: 9007199254740993n,
      missing: undefined,
      notANumber: Number.NaN,
      negativeZero: -0,
      bytes: new Uint16Array([512, 1024]),
      buffer: new Uint8Array([1, 2, 3]).buffer,
    };

    const result = deserializeServerFunctionValue(
      serializeServerFunctionValue(value),
    ) as typeof value;

    expect(result.date).toEqual(value.date);
    expect(result.url.href).toBe(value.url.href);
    expect(Array.from(result.search.entries())).toEqual(Array.from(value.search.entries()));
    expect(result.regexp.source).toBe(value.regexp.source);
    expect(result.regexp.flags).toBe(value.regexp.flags);
    expect(result.map).toEqual(value.map);
    expect(result.set).toEqual(value.set);
    expect(result.bigint).toBe(value.bigint);
    expect(result).toHaveProperty("missing", undefined);
    expect(result.notANumber).toBeNaN();
    expect(Object.is(result.negativeZero, -0)).toBe(true);
    expect(result.bytes).toEqual(value.bytes);
    expect(Array.from(new Uint8Array(result.buffer))).toEqual([1, 2, 3]);
  });

  it("preserves null-prototype objects and safely restores the __proto__ key", () => {
    const value = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(value, "__proto__", {
      value: "ordinary data",
      enumerable: true,
    });
    value.name = "Vynn";

    const result = deserializeServerFunctionValue(
      serializeServerFunctionValue(value),
    ) as Record<string, unknown>;

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.__proto__).toBe("ordinary data");
    expect(result.name).toBe("Vynn");
  });

  it("round-trips errors without depending on stack traces", () => {
    const value = new TypeError("invalid input", {
      cause: { field: "email" },
    });
    const result = deserializeServerFunctionValue(
      serializeServerFunctionValue(value),
    ) as Error & { cause?: unknown };

    expect(result).toBeInstanceOf(Error);
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("invalid input");
    expect(result.cause).toEqual({ field: "email" });
  });

  it("supports application-defined codecs", () => {
    class UserId {
      constructor(readonly value: string) {}
    }

    const unregister = registerServerFunctionCodec<UserId>({
      tag: "test-user-id",
      test: (value): value is UserId => value instanceof UserId,
      serialize: (value) => value.value,
      deserialize: (value) => new UserId(String(value)),
    });

    try {
      const result = deserializeServerFunctionValue(
        serializeServerFunctionValue(new UserId("user-1")),
      );

      expect(result).toBeInstanceOf(UserId);
      expect((result as UserId).value).toBe("user-1");
    } finally {
      unregister();
    }
  });

  it("rejects cycles, functions, and unsupported class instances", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => serializeServerFunctionValue(circular)).toThrow(/Cyclic/);
    expect(() => serializeServerFunctionValue(() => undefined)).toThrow(/Functions and symbols/);
    expect(() => serializeServerFunctionValue(new (class Value {})())).toThrow(/Register a codec/);
  });

  it("rejects duplicate codec tags", () => {
    const codec = {
      tag: "duplicate-test",
      test: (_value: unknown): _value is Date => false,
      serialize: (value: Date) => value.toISOString(),
      deserialize: (value: unknown) => new Date(String(value)),
    };
    const unregister = registerServerFunctionCodec(codec);

    try {
      expect(() => registerServerFunctionCodec(codec)).toThrow(/already registered/);
    } finally {
      unregister();
    }
  });
});
