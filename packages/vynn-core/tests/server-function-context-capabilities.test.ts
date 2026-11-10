import { describe, expect, it } from "vitest";

import { getRequestContext } from "../src/server/index.ts";
import {
  createServerFunctionContext,
  runWithServerFunctionContext,
} from "../src/server/server-function-context.ts";

describe("request context capabilities", () => {
  it("exposes request headers, cookies, response metadata, locals, and cancellation", async () => {
    const controller = new AbortController();
    const currentRequest = new Request("https://example.test/__vynn/server-function", {
      method: "POST",
      headers: {
        cookie: "session=hello%20world; theme=dark",
        "x-request-id": "request-1",
      },
      signal: controller.signal,
    });

    await runWithServerFunctionContext(
      { request: currentRequest, functionId: "vynn_0123456789abcdefabcd" },
      async () => {
        const context = getRequestContext();

        expect(context.request.headers.get("x-request-id")).toBe("request-1");
        expect(context.cookies.get("session")).toBe("hello world");
        expect(context.cookies.get("missing")).toBeUndefined();
        expect(context.signal.aborted).toBe(false);

        context.response.status = 201;
        context.response.headers.set("x-action", "updated");
        context.response.headers.append("x-trace", "one");
        context.response.headers.append("x-trace", "two");
        context.cookies.set("session", "next value", {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: true,
        });

        context.locals.set("user", { id: "user-1" });
        expect(context.locals.get("user")).toEqual({ id: "user-1" });

        expect(context.response.status).toBe(201);
        expect(context.response.headers.get("x-action")).toBe("updated");
        expect(context.response.headers.get("x-trace")).toBe("one, two");
        expect(context.response.headers.get("set-cookie")).toContain("HttpOnly");
        expect(context.response.headers.get("set-cookie")).toContain("SameSite=Lax");
      },
    );
  });

  it("expires cookies through the grouped cookie API", async () => {
    const currentRequest = new Request("https://example.test/__vynn/server-function");

    await runWithServerFunctionContext({ request: currentRequest }, () => {
      const context = getRequestContext();
      context.cookies.delete("session", { path: "/" });

      expect(context.response.headers.get("set-cookie")).toContain("session=");
      expect(context.response.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(context.response.headers.get("set-cookie")).toContain("Expires=");
    });
  });

  it("rejects response statuses that cannot carry the RPC response body", () => {
    const currentRequest = new Request("https://example.test/__vynn/server-function");

    expect(() =>
      runWithServerFunctionContext({ request: currentRequest }, () => {
        getRequestContext().response.status = 204;
      }),
    ).toThrow(/body-bearing 2xx status/);

    expect(() =>
      createServerFunctionContext({
        request: currentRequest,
        response: { status: 204 },
      }),
    ).toThrow(/body-bearing 2xx status/);
  });
});
