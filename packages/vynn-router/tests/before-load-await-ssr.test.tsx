// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Await, $computed, lazy, type JSX } from "vynn";
import { renderToServer } from "vynn/server";

import { redirect, Router, type Route } from "../src";

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
  it("streams an eager async computed through Await without blocking initial HTML", async () => {
    let resolveValue!: (value: string) => void;
    let getterRuns = 0;

    const rendered = renderToServer(() => {
      const value = $computed(
        async () => {
          getterRuns += 1;
          return new Promise<string>((resolve) => {
            resolveValue = resolve;
          });
        },
      );

      return Await({
        fallback: "Loading",
        get children(): JSX.Element {
          return value.value;
        },
      });
    }, "stream");

    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader.read();

    expect(firstChunk.done).toBe(false);
    expect(decoder.decode(firstChunk.value)).toContain("Loading");
    expect(getterRuns).toBe(1);

    resolveValue("Ready");

    let remainder = "";

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      remainder += decoder.decode(chunk.value);
    }

    expect(remainder).toContain("Ready");
  });

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

  it("surfaces a redirect before the first chunk behind a lazy layout", async () => {
    let guardRuns = 0;
    let routeComponentRendered = false;

    const LazyLayout = lazy(
      () =>
        Promise.resolve({
          Layout: (props: { children?: JSX.Element }) => <main>{props.children}</main>,
        }),
      "Layout",
    );

    const routes: Route[] = [
      {
        path: "/",
        component: LazyLayout as unknown as Route["component"],
        children: [
          {
            path: "/redirect",
            component: (() => {
              routeComponentRendered = true;
              return <p>This route must not render</p>;
            }) as unknown as Route["component"],
            beforeLoad: async () => {
              guardRuns++;
              await Promise.resolve();
              redirect("/params/1?id=1");
            },
          },
        ],
      },
    ];

    const rendered = renderToServer(
      () =>
        Await({
          fallback: "Page Is Loading",
          get children(): JSX.Element {
            return Router({ url: "/redirect", routes }) as unknown as JSX.Element;
          },
        }),
      "stream",
    );
    const reader = rendered.body.getReader();

    let receivedChunk = false;
    let response: unknown;

    try {
      const firstChunk = await reader.read();
      receivedChunk = !firstChunk.done;
    } catch (error) {
      response = error;
    }

    expect(receivedChunk).toBe(false);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/params/1?id=1");
    expect(routeComponentRendered).toBe(false);
    expect(guardRuns).toBe(1);
  });
});
