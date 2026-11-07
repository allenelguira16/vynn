// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Await } from "../src/components/await";
import { $async } from "../src/reactivity/$async";
import { $computed } from "../src/reactivity/$computed";
import { $renderEffect } from "../src/reactivity/$effect";
import { NotReadyError } from "../src/reactivity/not-ready-error";
import { $nodes } from "../src/render/$nodes";
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

  it("keeps a route guard blocking when a sibling async value is pending", async () => {
    let rejectGuard!: (error: unknown) => void;
    const guardPromise = new Promise<never>((_resolve, reject) => {
      rejectGuard = reject;
    });
    const response = new Response(null, {
      status: 302,
      headers: { Location: "/params/1?id=1" },
    });

    const rendered = renderToServer(
      () => {
        const sibling = $async(() => new Promise<never>(() => {}));
        const guard = $computed(async () => {
          await guardPromise;
          return "allowed";
        }, { lazy: true });

        return $nodes(() =>
          Await({
            fallback: "Page Is Loading",
            get children(): JSX.Element {
              // Simulate an unrelated page resource that has already
              // registered with this Await boundary.
              try {
                sibling.value;
              } catch (error) {
                if (!(error instanceof NotReadyError)) throw error;
              }

              // RouteOutlet reads its guard inside a render effect.
              $renderEffect(() => {
                try {
                  guard.value;
                } catch (error) {
                  if (error instanceof Response) return;
                  throw error;
                }
              });

              return "Route";
            },
          }),
        ) as unknown as JSX.Element;
      },
      "stream",
    );

    const reader = rendered.body.getReader();
    const firstChunk = reader.read();

    // The request must fail with the redirect before the fallback is streamed.
    rejectGuard(response);
    await expect(firstChunk).rejects.toBe(response);
  });

  it("propagates redirects thrown after awaiting a guard in async mode", async () => {
    let guardRuns = 0;
    const routes = createRoutes(async () => {
      guardRuns++;
      await Promise.resolve();
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

  it("propagates redirects thrown after awaiting a guard in stream mode", async () => {
    let guardRuns = 0;
    const routes = createRoutes(async () => {
      guardRuns++;
      await Promise.resolve();
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
