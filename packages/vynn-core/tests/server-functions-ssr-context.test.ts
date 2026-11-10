import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { createServerReference } from "../src/server-functions/server.ts";
import { getRequestContext } from "../src/server/index.ts";
import { renderToServer } from "../src/server/render-to-server.ts";

describe("server functions during SSR", () => {
  it("inherits the page request and records response metadata", () => {
    const id = "vynn_30000000000000000001";
    const readRequest = createServerReference(
      (_captures: unknown[]) => {
        const context = getRequestContext();
        context.response.headers.set("x-rendered-by", "vynn");
        context.cookies.set("ssr-session", "created", {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        });

        return [context.request.url, context.cookies.get("session"), context.functionId].join("|");
      },
      id,
      () => [],
    );

    const request = new Request("https://example.test/projects/42", {
      headers: { cookie: "session=from-page" },
    });
    const result = renderToServer(() => readRequest() as unknown as JSX.Element, "sync", request);

    expect(result.body).toBe("https://example.test/projects/42|from-page|" + id);
    expect(result.response?.status).toBe(200);
    expect(result.response?.headers.get("x-rendered-by")).toBe("vynn");
    expect(result.response?.headers.get("set-cookie")).toContain("ssr-session=created");
    expect(result.response?.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("keeps request-local state shared across nested server-function calls", () => {
    const innerId = "vynn_30000000000000000002";
    const outerId = "vynn_30000000000000000003";
    const inner = createServerReference(
      (_captures: unknown[]) => getRequestContext().functionId,
      innerId,
      () => [],
    );
    const outer = createServerReference(
      (_captures: unknown[]) => {
        const context = getRequestContext();
        const nestedId = inner();
        return context.request.url + "|" + nestedId + "|" + getRequestContext().functionId;
      },
      outerId,
      () => [],
    );

    const request = new Request("https://example.test/nested");
    const result = renderToServer(() => outer() as unknown as JSX.Element, "sync", request);

    expect(result.body).toBe("https://example.test/nested|" + innerId + "|" + outerId);
  });
});
