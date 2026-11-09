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
      body: JSON.stringify({ id, args: ["input"] }),
    });
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
