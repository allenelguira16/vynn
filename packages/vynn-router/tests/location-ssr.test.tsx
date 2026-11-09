// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { JSX } from "vynn";

import { renderToServer } from "vynn/server";
import { $location, Router, type Route } from "../src";

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

    // SSR inserts marker comments between dynamic text nodes. They are
    // renderer metadata, not part of the rendered text content.
    const firstText = firstRequest.replace(/<!--[\s\S]*?-->/g, "");
    const secondText = secondRequest.replace(/<!--[\s\S]*?-->/g, "");

    expect(firstText).toContain("Page /first/missing?source=first");
    expect(secondText).toContain("Page /second/missing?source=second");
  });
});
