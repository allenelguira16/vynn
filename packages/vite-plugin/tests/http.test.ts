import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  addBaseToRequestUrl,
  createWebRequest,
  isHtmlNavigation,
  joinAssetBase,
  negotiateResponseEncoding,
  toDevUrl,
  writeResponse,
} from "../src/plugins/app/http";

function request(method: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method, headers } as unknown as IncomingMessage;
}

describe("isHtmlNavigation", () => {
  it("accepts document requests", () => {
    expect(isHtmlNavigation(request("GET", { accept: "text/html,application/xhtml+xml" }))).toBe(
      true,
    );
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "*/*",
          "sec-fetch-dest": "document",
        }),
      ),
    ).toBe(true);
    expect(isHtmlNavigation(request("HEAD", { accept: "text/html" }))).toBe(true);
  });

  it("does not treat generic or subresource requests as document navigations", () => {
    expect(isHtmlNavigation(request("GET", { accept: "*/*" }))).toBe(false);
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "image/avif,image/webp,image/svg+xml,*/*;q=0.8",
          "sec-fetch-dest": "image",
        }),
      ),
    ).toBe(false);
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "text/html,*/*",
          "sec-fetch-dest": "empty",
        }),
      ),
    ).toBe(false);
    expect(isHtmlNavigation(request("POST", { accept: "text/html" }))).toBe(false);
  });

  it("keeps requests without an Accept header eligible for SSR", () => {
    expect(isHtmlNavigation(request("GET"))).toBe(true);
  });

  it.each([
    ["facebookexternalhit/1.1", "*/*"],
    ["Facebot", "application/json, */*;q=0.8"],
    ["Twitterbot/1.0", "*/*"],
    ["LinkedInBot/1.0", "*/*"],
    ["Slackbot-LinkExpanding 1.0", "*/*"],
    ["Discordbot/2.0", "*/*"],
    ["TelegramBot", "*/*"],
    ["WhatsApp/2.0", "*/*"],
    ["Pinterestbot/1.0", "*/*"],
  ])("accepts social preview crawler %s with Accept %s", (userAgent, accept) => {
    expect(
      isHtmlNavigation(
        request("GET", {
          accept,
          "user-agent": userAgent,
        }),
      ),
    ).toBe(true);
  });

  it("does not treat social preview crawler subresource requests as document navigations", () => {
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "*/*",
          "user-agent": "facebookexternalhit/1.1",
          "sec-fetch-dest": "image",
        }),
      ),
    ).toBe(false);
  });
});

describe("HTTP URL helpers", () => {
  it("normalizes file paths into browser URLs", () => {
    const root = resolve("/project");
    expect(toDevUrl(root, resolve(root, "src", "entry.ts"))).toBe("/src/entry.ts");
  });

  it("joins an asset base without corrupting absolute URLs or slashes", () => {
    expect(joinAssetBase("/", "/assets/app.js")).toBe("/assets/app.js");
    expect(joinAssetBase("/base/", "/assets/app.js")).toBe("/base/assets/app.js");
    expect(joinAssetBase("./", "/assets/app.js")).toBe("./assets/app.js");
    expect(joinAssetBase("https://cdn.example.com/base/", "/assets/app.js")).toBe(
      "https://cdn.example.com/base/assets/app.js",
    );
    expect(joinAssetBase("/", "https://cdn.example.com/app.js")).toBe(
      "https://cdn.example.com/app.js",
    );
  });

  it("adds the base path to incoming request URLs once", () => {
    expect(addBaseToRequestUrl("/base", "/users?active=true")).toBe("/base/users?active=true");
    expect(addBaseToRequestUrl("/base", "/base/users?active=true")).toBe("/base/users?active=true");
  });
});


describe("Vite request adapter", () => {
  it("uses the shared Node adapter with the Vite-resolved URL", async () => {
    const server = createServer((incoming, outgoing) => {
      void (async () => {
        const request = createWebRequest(incoming, "/rewritten?from=vite");
        const body = await request.text();

        outgoing.setHeader("content-type", "application/json");
        outgoing.end(
          JSON.stringify({
            url: request.url,
            method: request.method,
            body,
            connectionHeader: request.headers.has("connection"),
            nominatedHeader: request.headers.has("x-hop-by-hop"),
            contentType: request.headers.get("content-type"),
          }),
        );
      })().catch((error: unknown) => {
        outgoing.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    });

    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolveListen) => server.once("listening", resolveListen));

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind a TCP port");
      }

      const responseBody = await new Promise<string>((resolveResponse, rejectResponse) => {
        const outgoing = httpRequest(
          {
            host: "127.0.0.1",
            port: address.port,
            path: "/original",
            method: "POST",
            headers: {
              connection: "x-hop-by-hop",
              "x-hop-by-hop": "must-not-reach-fetch",
              "content-type": "text/plain",
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => resolveResponse(Buffer.concat(chunks).toString()));
            response.on("error", rejectResponse);
          },
        );
        outgoing.on("error", rejectResponse);
        outgoing.end("request body");
      });

      const result = JSON.parse(responseBody) as {
        url: string;
        method: string;
        body: string;
        connectionHeader: boolean;
        nominatedHeader: boolean;
        contentType: string | null;
      };

      expect(result).toEqual({
        url: `http://127.0.0.1:${address.port}/rewritten?from=vite`,
        method: "POST",
        body: "request body",
        connectionHeader: false,
        nominatedHeader: false,
        contentType: "text/plain",
      });
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  });
});

describe("Vite response headers", () => {
  it("applies configured headers as defaults and lets response headers override them", async () => {
    const server = createServer((_req, res) => {
      void writeResponse(
        res,
        new Response("ok", {
          headers: {
            "x-shared-header": "from-response",
          },
        }),
        {
          headers: {
            "x-vite-header": "from-vite",
            "x-shared-header": "from-vite",
          },
        },
      ).catch((error: unknown) => {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    });

    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolveListen) => server.once("listening", resolveListen));

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/`);

      expect(response.headers.get("x-vite-header")).toBe("from-vite");
      expect(response.headers.get("x-shared-header")).toBe("from-response");
      expect(await response.text()).toBe("ok");
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  });
});

describe("SSR response compression", () => {
  it("negotiates Brotli and Gzip quality values", () => {
    expect(negotiateResponseEncoding("br, gzip")).toBe("br");
    expect(negotiateResponseEncoding("br;q=0.5, gzip;q=1")).toBe("gzip");
    expect(negotiateResponseEncoding("br;q=0, gzip;q=0.8")).toBe("gzip");
    expect(negotiateResponseEncoding("br;q=0, gzip;q=0")).toBeNull();
    expect(negotiateResponseEncoding(undefined)).toBeNull();
  });


  it.each(["gzip", "br"] as const)(
    "treats a client disconnect during %s compression as a normal abort",
    async (encoding) => {
      let finishWriter!: (error: unknown) => void;
      const writerFinished = new Promise<unknown>((resolveWriter) => {
        finishWriter = resolveWriter;
      });
      let bodyCancelled = false;
      let receivedCompressedChunk = false;

      const server = createServer((_req, res) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            // Keep the response open after the first chunk so the client can
            // disconnect while the compression pipeline is still active.
            controller.enqueue(Buffer.from("Vynn SSR content ".repeat(4096)));
          },
          cancel() {
            bodyCancelled = true;
          },
        });

        void writeResponse(
          res,
          new Response(body, {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
          { acceptEncoding: encoding },
        ).then(
          () => finishWriter(null),
          (error: unknown) => finishWriter(error),
        );
      });

      server.listen(0, "127.0.0.1");
      await new Promise<void>((resolveListen) => server.once("listening", resolveListen));

      try {
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new Error("Test server did not bind a TCP port");
        }

        const client = httpRequest({
          host: "127.0.0.1",
          port: address.port,
          path: "/",
          headers: { "accept-encoding": encoding },
        });
        client.on("error", () => undefined);
        client.on("response", (response) => {
          response.on("error", () => undefined);
          response.once("data", () => {
            receivedCompressedChunk = true;
            response.destroy();
          });
        });
        client.end();

        const writerError = await writerFinished;
        expect(writerError).toBeNull();
        expect(receivedCompressedChunk).toBe(true);
        expect(bodyCancelled).toBe(true);
      } finally {
        await new Promise<void>((resolveClose, rejectClose) => {
          server.close((error) => (error ? rejectClose(error) : resolveClose()));
          server.closeAllConnections();
        });
      }
    },
  );

  it.each([
    ["gzip", "gzip"],
    ["br", "br"],
  ] as const)("streams an SSR response using %s compression", async (acceptEncoding, encoding) => {
    const expected = [
      "<!doctype html><html><head><title>Vynn</title></head><body>",
      "<main>" + "Vynn SSR content ".repeat(256) + "</main></body></html>",
    ].join("");
    const server = createServer((req, res) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from(expected.slice(0, 58)));
          controller.enqueue(Buffer.from(expected.slice(58)));
          controller.close();
        },
      });

      void writeResponse(
        res,
        new Response(body, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            vary: "Accept-Language",
          },
        }),
        { acceptEncoding: req.headers["accept-encoding"] },
      ).catch((error: unknown) => {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    });

    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolveListen) => server.once("listening", resolveListen));

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind a TCP port");
      }

      const result = await new Promise<{
        headers: Record<string, string | string[] | undefined>;
        body: Buffer;
      }>((resolveResponse, rejectResponse) => {
        const request = httpRequest(
          {
            host: "127.0.0.1",
            port: address.port,
            path: "/",
            headers: { "accept-encoding": acceptEncoding },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => {
              resolveResponse({
                headers: response.headers,
                body: Buffer.concat(chunks),
              });
            });
            response.on("error", rejectResponse);
          },
        );
        request.on("error", rejectResponse);
        request.end();
      });

      expect(result.headers["content-encoding"]).toBe(encoding);
      expect(String(result.headers.vary)).toContain("Accept-Language");
      expect(String(result.headers.vary)).toContain("Accept-Encoding");
      const decoded =
        encoding === "br" ? brotliDecompressSync(result.body) : gunzipSync(result.body);
      expect(decoded.toString()).toBe(expected);
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  });
});
