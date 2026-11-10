import { beforeEach, describe, expect, it } from "vitest";

import {
  createServerFunctionHandler,
  createServerReference,
} from "../src/server-functions/server.ts";
import {
  getServerFunctionContext,
  getServerFunctionRequest,
} from "../src/server/server-function-context.ts";

const makeRequest = (
  body: string,
  options: {
    method?: string;
    origin?: string;
    contentType?: string;
    url?: string;
  } = {},
) =>
  new Request(options.url ?? "https://app.test/__vynn/server-function", {
    method: options.method ?? "POST",
    headers: {
      origin: options.origin ?? "https://app.test",
      "content-type": options.contentType ?? "application/json",
    },
    ...(options.method === "GET" ? {} : { body }),
  });

describe("server-function runtime", () => {
  let nextId: number;

  beforeEach(() => {
    nextId = 0;
  });

  const createId = () => {
    nextId += 1;
    return `vynn_${nextId.toString(16).padStart(20, "0")}`;
  };

  it("dispatches a registered implementation and preserves request context across await", async () => {
    const id = createId();
    createServerReference(async (name: string) => {
      await Promise.resolve();
      return {
        greeting: `Hello ${name}`,
        requestUrl: getServerFunctionRequest().url,
        functionId: getServerFunctionContext().functionId,
      };
    }, id);

    const handler = createServerFunctionHandler({ development: true });
    const response = await handler(makeRequest(JSON.stringify({ id, args: ["Vynn"] })));

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      value: {
        greeting: "Hello Vynn",
        requestUrl: "https://app.test/__vynn/server-function",
        functionId: id,
      },
    });
  });

  it("passes captured values before RPC arguments to compiler-generated implementations", async () => {
    const id = createId();
    createServerReference(
      (captures: unknown[], name: string) => `${String(captures[0])}:${name}`,
      id,
      () => ["tenant-a"],
    );

    const handler = createServerFunctionHandler({ development: true });
    const response = await handler(
      makeRequest(JSON.stringify({ id, args: ["Ada"], captures: ["tenant-b"] })),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      value: "tenant-b:Ada",
    });
  });

  it("returns manually registered server functions unchanged", () => {
    const id = createId();
    const implementation = (name: string) => `Hello ${name}`;

    expect(createServerReference(implementation, id)).toBe(implementation);
  });

  it("keeps manually registered implementations compatible without captures", async () => {
    const id = createId();
    createServerReference((name: string) => `Hello ${name}`, id);

    const handler = createServerFunctionHandler({ development: true });
    const response = await handler(
      makeRequest(JSON.stringify({ id, args: ["Vynn"] })),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      value: "Hello Vynn",
    });
  });

  it("keeps custom resolvers on the original arguments-only contract", async () => {
    const id = createId();
    const handler = createServerFunctionHandler({
      development: true,
      resolve: (requestedId) =>
        requestedId === id
          ? (name: string) => `Hello ${name}`
          : undefined,
    });
    const response = await handler(
      makeRequest(JSON.stringify({ id, args: ["Ada"], captures: ["ignored"] })),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      value: "Hello Ada",
    });
  });

  it("returns null for requests outside the configured endpoint", async () => {
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest("{}", { url: "https://app.test/other" }));

    expect(response).toBeNull();
  });

  it("rejects methods other than POST", async () => {
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest("", { method: "GET" }));

    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });

  it("rejects cross-origin requests", async () => {
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest("{}", { origin: "https://evil.test" }));

    expect(response?.status).toBe(403);
  });

  it("allows explicitly configured origins", async () => {
    const id = createId();
    createServerReference(async () => "accepted", id);
    const handler = createServerFunctionHandler({
      allowedOrigins: ["https://trusted.test/path-is-normalized"],
    });
    const response = await handler(
      makeRequest(JSON.stringify({ id, args: [] }), {
        origin: "https://trusted.test",
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      value: "accepted",
    });
  });

  it("rejects unsupported content types", async () => {
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest("{}", { contentType: "text/plain" }));

    expect(response?.status).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest("{"));

    expect(response?.status).toBe(400);
  });

  it("rejects oversized request bodies", async () => {
    const handler = createServerFunctionHandler({ maxRequestBytes: 2 });
    const response = await handler(makeRequest('{"id":"too large"}'));

    expect(response?.status).toBe(413);
  });

  it("rejects malformed function IDs and argument lists", async () => {
    const handler = createServerFunctionHandler();

    const invalidId = await handler(makeRequest(JSON.stringify({ id: "not-an-id", args: [] })));
    const invalidArgs = await handler(
      makeRequest(JSON.stringify({ id: createId(), args: "not-an-array" })),
    );

    expect(invalidId?.status).toBe(400);
    expect(invalidArgs?.status).toBe(400);
  });

  it("returns 404 for unknown server functions", async () => {
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest(JSON.stringify({ id: createId(), args: [] })));

    expect(response?.status).toBe(404);
  });

  it("returns a generic error in production when an implementation throws", async () => {
    const id = createId();
    createServerReference(() => {
      throw new Error("private database detail");
    }, id);
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest(JSON.stringify({ id, args: [] })));

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: "Server function failed.",
    });
  });

  it("exposes implementation errors when explicitly configured", async () => {
    const id = createId();
    createServerReference(() => {
      throw new Error("useful development detail");
    }, id);
    const handler = createServerFunctionHandler({ exposeErrors: true });
    const response = await handler(makeRequest(JSON.stringify({ id, args: [] })));

    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: "useful development detail",
    });
  });

  it("rejects non-serializable return values", async () => {
    const id = createId();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    createServerReference(() => circular, id);
    const handler = createServerFunctionHandler();
    const response = await handler(makeRequest(JSON.stringify({ id, args: [] })));

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: "Server function returned a non-serializable value.",
    });
  });
});
