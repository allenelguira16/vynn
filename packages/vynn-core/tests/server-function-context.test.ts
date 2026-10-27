import { describe, expect, it } from "vitest";
import { getServerFunctionContext, getServerFunctionRequest, runWithServerFunctionContext } from "../src/server/server-function-context";

function request(cookie: string): Request {
  return new Request("https://example.test/__vynn/server-function", { method: "POST", headers: { cookie } });
}

describe("server-function request context", () => {
  it("exposes the active request and function ID", async () => {
    const currentRequest = request("session=one");
    await runWithServerFunctionContext({ request: currentRequest, functionId: "vynn_0123456789abcdefabcd" }, async () => {
      expect(getServerFunctionContext().functionId).toBe("vynn_0123456789abcdefabcd");
      expect(getServerFunctionRequest()).toBe(currentRequest);
      expect(getServerFunctionRequest().headers.get("cookie")).toBe("session=one");
    });
  });

  it("isolates concurrent requests across awaits", async () => {
    const run = (cookie: string, delay: number) => runWithServerFunctionContext(
      { request: request(cookie), functionId: "vynn_0123456789abcdefabcd" },
      async () => { await new Promise((resolve) => setTimeout(resolve, delay)); return getServerFunctionRequest().headers.get("cookie"); },
    );
    await expect(Promise.all([run("session=one", 10), run("session=two", 1)])).resolves.toEqual(["session=one", "session=two"]);
  });

  it("throws outside a server-function request", () => {
    expect(() => getServerFunctionRequest()).toThrow(/No server-function request context/);
  });
});
