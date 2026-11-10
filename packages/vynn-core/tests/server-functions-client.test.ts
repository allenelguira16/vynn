import { afterEach, describe, expect, it, vi } from "vitest";

import { createServerReference } from "../src/server-functions/client.ts";
import { deserializeServerFunctionValue } from "../src/server-functions/serialization.ts";

describe("client server-function references", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON arguments to the configured RPC endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: "result" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const id = "vynn_00000000000000000002";
    const load = createServerReference<(value: string) => Promise<string>>(id, {
      endpoint: "/custom-rpc",
    });

    await expect(load("input")).resolves.toBe("result");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/custom-rpc");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
    });

    const payload = JSON.parse(String(init.body)) as {
      version: number;
      id: string;
      args: unknown;
      captures: unknown;
    };
    expect(payload.version).toBe(1);
    expect(payload.id).toBe(id);
    expect(deserializeServerFunctionValue(payload.args)).toEqual(["input"]);
    expect(deserializeServerFunctionValue(payload.captures)).toEqual([]);
  });

  it("reads lexical captures at call time and sends them with the arguments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: "result" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    let tenantId = "initial";
    const action = createServerReference<() => Promise<string>>("vynn_00000000000000000004", {
      getCaptures: () => [tenantId],
    });

    tenantId = "latest";
    await action();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      version: number;
      id: string;
      args: unknown;
      captures: unknown;
    };
    expect(payload.version).toBe(1);
    expect(payload.id).toBe("vynn_00000000000000000004");
    expect(deserializeServerFunctionValue(payload.args)).toEqual([]);
    expect(deserializeServerFunctionValue(payload.captures)).toEqual(["latest"]);
  });

  it("accepts the compiler capture-provider shorthand and uses the default endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: "result" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const action = createServerReference<() => Promise<string>>("vynn_00000000000000000006", () => [
      "tenant-a",
    ]);

    await action();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/__vynn/server-function");
    const payload = JSON.parse(String(init.body)) as {
      version: number;
      id: string;
      args: unknown;
      captures: unknown;
    };
    expect(payload.version).toBe(1);
    expect(payload.id).toBe("vynn_00000000000000000006");
    expect(deserializeServerFunctionValue(payload.args)).toEqual([]);
    expect(deserializeServerFunctionValue(payload.captures)).toEqual(["tenant-a"]);
  });

  it("rejects non-JSON lexical captures before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const action = createServerReference<() => Promise<unknown>>("vynn_00000000000000000005", {
      getCaptures: () => [() => "not serializable"],
    });

    await expect(action()).rejects.toThrow(
      /Functions and symbols cannot be sent through server functions/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server error returned by the RPC handler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "Server function failed." }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const load = createServerReference<() => Promise<unknown>>("vynn_00000000000000000003");

    await expect(load()).rejects.toThrow("Server function failed.");
  });

  it("rejects invalid generated IDs", () => {
    expect(() => createServerReference("invalid" as never)).toThrow(/Invalid server-function ID/);
  });
});
