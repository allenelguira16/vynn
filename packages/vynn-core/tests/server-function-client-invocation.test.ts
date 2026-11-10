import { afterEach, describe, expect, it } from "vitest";

import {
  createServerReference,
  invokeServerFunction,
} from "../src/server-functions/client.ts";
import { serializeServerFunctionValue } from "../src/server-functions/serialization.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("client server-function invocation", () => {
  it("sends versioned values and forwards per-call cancellation", async () => {
    let receivedSignal: AbortSignal | null | undefined;
    let receivedBody: string | undefined;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedSignal = init?.signal;
      receivedBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          version: 1,
          ok: true,
          value: serializeServerFunctionValue(new Date("2026-11-11T00:00:00.000Z")),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    type Lookup = (query: string) => Promise<Date>;
    const reference = createServerReference<Lookup>("vynn_20000000000000000001", {
      endpoint: "/custom-rpc",
      getCaptures: () => [new Date("2026-11-10T00:00:00.000Z")],
    });
    const controller = new AbortController();

    const result = await invokeServerFunction(reference, ["vynn"], {
      signal: controller.signal,
    });

    expect(result).toEqual(new Date("2026-11-11T00:00:00.000Z"));
    expect(receivedSignal).toBe(controller.signal);

    const payload = JSON.parse(receivedBody ?? "{}") as {
      version: number;
      args: unknown;
      captures: unknown;
    };
    expect(payload.version).toBe(1);
    expect(payload.args).toBeDefined();
    expect(payload.captures).toBeDefined();
  });

  it("keeps generated references directly callable without invocation options", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          version: 1,
          ok: true,
          value: serializeServerFunctionValue("ok"),
        }),
        { status: 200 },
      )) as typeof fetch;

    type Action = () => Promise<string>;
    const reference = createServerReference<Action>("vynn_20000000000000000002");

    await expect(reference()).resolves.toBe("ok");
  });
});
