import { describe, expect, it } from "vitest";

import * as serverApi from "../src/server/index.ts";
import { runWithServerFunctionContext } from "../src/server/server-function-context.ts";

function request(cookie: string): Request {
  return new Request("https://example.test/__vynn/server-function", {
    method: "POST",
    headers: { cookie },
  });
}

describe("request context public API", () => {
  it("exposes one accessor instead of individual request-context helpers", () => {
    expect(typeof serverApi.getRequestContext).toBe("function");
    expect(serverApi).not.toHaveProperty("getServerFunctionContext");
    expect(serverApi).not.toHaveProperty("getServerFunctionRequest");
    expect(serverApi).not.toHaveProperty("getServerFunctionCookie");
    expect(serverApi).not.toHaveProperty("setServerFunctionCookie");
    expect(serverApi).not.toHaveProperty("setServerFunctionLocal");
    expect(serverApi).not.toHaveProperty("createServerFunctionContext");
    expect(serverApi).not.toHaveProperty("runWithServerFunctionContext");
  });

  it("exposes the active request and function ID", async () => {
    const currentRequest = request("session=one");
    await runWithServerFunctionContext(
      { request: currentRequest, functionId: "vynn_0123456789abcdefabcd" },
      async () => {
        const context = serverApi.getRequestContext();

        expect(context.functionId).toBe("vynn_0123456789abcdefabcd");
        expect(context.request).toBe(currentRequest);
        expect(context.request.headers.get("cookie")).toBe("session=one");
        expect(context.cookies.get("session")).toBe("one");
      },
    );
  });

  it("isolates concurrent requests across awaits", async () => {
    const run = (cookie: string, delay: number) =>
      runWithServerFunctionContext(
        { request: request(cookie), functionId: "vynn_0123456789abcdefabcd" },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return serverApi.getRequestContext().request.headers.get("cookie");
        },
      );
    await expect(Promise.all([run("session=one", 10), run("session=two", 1)])).resolves.toEqual([
      "session=one",
      "session=two",
    ]);
  });

  it("shares request scope across duplicate module instances", async () => {
    const currentRequest = request("session=shared");

    await runWithServerFunctionContext(
      { request: currentRequest, functionId: "vynn_0123456789abcdefabcd" },
      async () => {
        // A distinct Vite module URL simulates the RPC runtime and application
        // server entry loading the same package through separate module graphs.
        const duplicate = await import("../src/server/server-function-context.ts?duplicate");

        expect(duplicate.getRequestContext().request).toBe(currentRequest);
        expect(duplicate.getRequestContext().cookies.get("session")).toBe("shared");
      },
    );
  });

  it("throws outside an active request", () => {
    expect(() => serverApi.getRequestContext()).toThrow(/No request context is active/);
  });
});
