import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createServer, type Server, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { createListener, type FetchRequestHandler } from "../../src/server/node";

async function withServer(
  handler: FetchRequestHandler,
  run: (url: string) => Promise<void>,
  onResponse?: (response: ServerResponse) => void,
): Promise<void> {
  const server = createServer((request, response) => {
    onResponse?.(response);
    createListener(handler)(request, response);
  });
  server.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    await run("http://127.0.0.1:" + address.port);
  } finally {
    await closeServer(server);
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe("Node server adapter", () => {
  it("converts incoming requests and streams Web responses", async () => {
    await withServer(
      async (request) =>
        new Response(
          request.method + ":" + (await request.text()),
          {
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
          },
        ),
      async (url) => {
        const response = await fetch(url, {
          method: "POST",
          body: "hello from Node",
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("POST:hello from Node");
      },
    );
  });


  it("flushes each streamed chunk for compression middleware", async () => {
    let flushCount = 0;

    await withServer(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode("first"));
              controller.enqueue(encoder.encode("second"));
              controller.close();
            },
          }),
        ),
      async (url) => {
        const response = await fetch(url);

        expect(await response.text()).toBe("firstsecond");
        expect(flushCount).toBe(2);
      },
      (response) => {
        (
          response as ServerResponse & { flush?: () => void }
        ).flush = () => {
          flushCount++;
        };
      },
    );
  });

  it("does not write a response body for HEAD requests", async () => {
    await withServer(
      () => new Response("this body must not be sent"),
      async (url) => {
        const response = await fetch(url, { method: "HEAD" });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("");
      },
    );
  });

  it("returns an HTTP 500 when a handler fails without middleware next", async () => {
    await withServer(
      () => {
        throw new Error("expected test failure");
      },
      async (url) => {
        const response = await fetch(url);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe("Internal Server Error");
      },
    );
  });
});
