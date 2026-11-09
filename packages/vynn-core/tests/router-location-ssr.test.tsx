import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { renderToServer } from "../src/server/render-to-server";
import { $location } from "../../vynn-router/src/location";
import { Router } from "../../vynn-router/src/router";
import type { Route } from "../../vynn-router/src/types";

async function renderRouter(url: string, routes: Route[]): Promise<string> {
  const rendered = await renderToServer(
    () => Router({ url, routes }) as unknown as JSX.Element,
    "async",
  );

  return rendered.body;
}

describe("router location SSR", () => {
  it("exposes the request-local pathname and search through $location", async () => {
    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <>{props.children}</>,
        children: [
          {
            path: "*",
            component: () => (
              <p>
                Page {$location.pathname}
                {$location.search}
              </p>
            ),
          },
        ],
      },
    ];

    const [firstRequest, secondRequest] = await Promise.all([
      renderRouter("/first/missing?source=first", routes),
      renderRouter("/second/missing?source=second", routes),
    ]);

    expect(firstRequest).toContain("Page /first/missing?source=first");
    expect(secondRequest).toContain("Page /second/missing?source=second");
  });
});
