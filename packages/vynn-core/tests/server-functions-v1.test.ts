import { describe, expect, it } from "vitest";

import {
  createServerFunctionHandler,
  createServerReference,
  ServerFunctionError,
} from "../src/server-functions/server.ts";
import {
  deserializeServerFunctionValue,
  serializeServerFunctionValue,
} from "../src/server-functions/serialization.ts";
import { getRequestContext } from "vynn/server";

const makeVersionedRequest = (
  id: string,
  args: unknown[],
  captures: unknown[] = [],
  signal?: AbortSignal,
) =>
  new Request("https://app.test/__vynn/server-function", {
    method: "POST",
    headers: {
      origin: "https://app.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      version: 1,
      id,
      args: serializeServerFunctionValue(args),
      captures: serializeServerFunctionValue(captures),
    }),
    signal,
  });

describe("versioned server-function runtime", () => {
  it("deserializes built-in values and serializes the implementation result", async () => {
    const id = "vynn_10000000000000000001";
    createServerReference((date: Date, input: Map<string, number>) => ({
      date: new Date(date.getTime() + 1000),
      count: input.get("count"),
      bigint: 42n,
    }), id);

    const handler = createServerFunctionHandler();
    const response = await handler(
      makeVersionedRequest(id, [
        new Date("2026-11-11T00:00:00.000Z"),
        new Map([["count", 3]]),
      ]),
    );

    expect(response?.status).toBe(200);
    const payload = await response?.json() as { version: number; ok: boolean; value: unknown };
    expect(payload.version).toBe(1);
    expect(payload.ok).toBe(true);

    const value = deserializeServerFunctionValue(payload.value) as {
      date: Date;
      count: number;
      bigint: bigint;
    };
    expect(value.date).toEqual(new Date("2026-11-11T00:00:01.000Z"));
    expect(value.count).toBe(3);
    expect(value.bigint).toBe(42n);
  });

  it("returns typed application errors with status, code, and details", async () => {
    const id = "vynn_10000000000000000002";
    createServerReference(() => {
      throw new ServerFunctionError("Access denied.", {
        code: "FORBIDDEN",
        status: 403,
        details: { permission: "project:write" },
      });
    }, id);

    const handler = createServerFunctionHandler();
    const response = await handler(makeVersionedRequest(id, []));

    expect(response?.status).toBe(403);
    const payload = await response?.json() as {
      version: number;
      ok: boolean;
      error: { name: string; message: string; code: string; status: number; details: unknown };
    };
    expect(payload.version).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatchObject({
      name: "ServerFunctionError",
      message: "Access denied.",
      code: "FORBIDDEN",
      status: 403,
    });
    expect(deserializeServerFunctionValue(payload.error.details)).toEqual({
      permission: "project:write",
    });
  });

  it("applies response status and cookies set during the invocation", async () => {
    const id = "vynn_10000000000000000003";
    createServerReference(() => {
      const context = getRequestContext();
      context.cookies.set("session", "rotated", {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      });
      context.response.status = 201;
      return { saved: true };
    }, id);

    const handler = createServerFunctionHandler();
    const response = await handler(makeVersionedRequest(id, []));

    expect(response?.status).toBe(201);
    expect(response?.headers.get("set-cookie")).toContain("session=rotated");
    expect(response?.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response?.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("propagates request cancellation to the server-function context", async () => {
    const id = "vynn_10000000000000000004";
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    createServerReference(async () => {
      const signal = getRequestContext().signal;
      markStarted();

      if (signal.aborted) return true;

      return new Promise<boolean>((resolve) => {
        signal.addEventListener("abort", () => resolve(true), { once: true });
      });
    }, id);

    const controller = new AbortController();
    const handler = createServerFunctionHandler();
    const responsePromise = handler(makeVersionedRequest(id, [], [], controller.signal));

    await started;
    controller.abort();

    const response = await responsePromise;
    const payload = await response?.json() as { value: unknown };
    expect(deserializeServerFunctionValue(payload.value)).toBe(true);
  });
});
