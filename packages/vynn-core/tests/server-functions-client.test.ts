import { afterEach, describe, expect, it, vi } from "vitest";

import { createServerReference } from "../src/server-functions/client.ts";

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
      body: JSON.stringify({ id, args: ["input"], captures: [] }),
    });
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
    const action = createServerReference<() => Promise<string>>(
      "vynn_00000000000000000004",
      { getCaptures: () => [tenantId] },
    );

    tenantId = "latest";
    await action();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      id: "vynn_00000000000000000004",
      args: [],
      captures: ["latest"],
    });
  });

  it("accepts the compiler capture-provider shorthand and uses the default endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: "result" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const action = createServerReference<() => Promise<string>>(
      "vynn_00000000000000000006",
      () => ["tenant-a"],
    );

    await action();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/__vynn/server-function");
    expect(JSON.parse(String(init.body))).toEqual({
      id: "vynn_00000000000000000006",
      args: [],
      captures: ["tenant-a"],
    });
  });

  it("rejects non-JSON lexical captures before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const action = createServerReference<() => Promise<unknown>>(
      "vynn_00000000000000000005",
      { getCaptures: () => [() => "not serializable"] },
    );

    await expect(action()).rejects.toThrow(/captures must contain only JSON-serializable values/);
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
