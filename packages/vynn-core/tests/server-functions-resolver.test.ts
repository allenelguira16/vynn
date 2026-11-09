import { describe, expect, it } from "vitest";

import {
  createServerFunctionHandler,
  createServerReference,
} from "../src/server-functions/server.ts";

it("treats a supplied implementation resolver as the production allowlist", async () => {
  const id = "vynn_00000000000000000001";
  createServerReference(() => "registered implementation", id);

  const handler = createServerFunctionHandler({
    resolve: () => undefined,
  });
  const response = await handler(
    new Request("https://app.test/__vynn/server-function", {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id, args: [] }),
    }),
  );

  expect(response?.status).toBe(404);
  await expect(response?.json()).resolves.toEqual({
    ok: false,
    error: "Unknown Vynn server function.",
  });
});

describe("resolver configuration", () => {
  it("rejects an invalid endpoint", () => {
    expect(() => createServerFunctionHandler({ endpoint: "rpc" })).toThrow(
      /endpoint must be an absolute pathname/,
    );
  });

  it("rejects an invalid request size limit", () => {
    expect(() => createServerFunctionHandler({ maxRequestBytes: 0 })).toThrow(
      /maxRequestBytes must be a safe integer/,
    );
  });

  it("rejects non-HTTP allowed origins", () => {
    expect(() => createServerFunctionHandler({ allowedOrigins: ["file:///tmp"] })).toThrow(
      /must use http or https/,
    );
  });
});
