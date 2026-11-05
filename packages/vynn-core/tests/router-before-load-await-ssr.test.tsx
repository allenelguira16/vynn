// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Await } from "../src/components/await";
import type { JSX } from "../src/types/jsx";
import { renderToServer } from "../src/server/render-to-server";
import { Router } from "../../vynn-router/src/router";
import { redirect } from "../../vynn-router/src/redirect";
import type { Route } from "../../vynn-router/src/types";

function createRoutes(beforeLoad: () => Promise<never>): Route[] {
  return [
    {
      path: "/",
      component: (props) => (
        <div>
          <Await fallback="Page Is Loading">{props.children}</Await>
        </div>
      ),
      children: [
        {
          path: "/redirect",
          component: () => <p>This route must not render</p>,
          beforeLoad,
        },
      ],
    },
  ];
}

describe("SSR redirects under Await", () => {
  it("evaluates a synchronous redirect guard exactly once in async mode", async () => {
    let guardRuns = 0;
    const routes = createRoutes(async () => {
      guardRuns++;
      redirect("/params/1?id=1");
    });

    let response: unknown;

    try {
      await renderToServer(
        () => Router({ url: "/redirect", routes }) as unknown as JSX.Element,
        "async",
      );
    } catch (error) {
      response = error;
    }

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/params/1?id=1");
    expect(guardRuns).toBe(1);
  });

  it("evaluates a synchronous redirect guard exactly once in stream mode", async () => {
    let guardRuns = 0;
    const routes = createRoutes(() => {
      guardRuns++;
      redirect("/params/1?id=1");
    });

    const rendered = renderToServer(
      () => Router({ url: "/redirect", routes }) as unknown as JSX.Element,
      "stream",
    );
    const reader = rendered.body.getReader();

    let response: unknown;

    try {
      await reader.read();
    } catch (error) {
      response = error;
    }

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/params/1?id=1");
    expect(guardRuns).toBe(1);
  });
});
