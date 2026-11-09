// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Await, lazy, type JSX } from "vynn";
import { renderToDOM } from "vynn/client";

import { $params, $search, navigate, Router, type Route } from "../src";

afterEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

describe("reactive route params and search", () => {
  it("keeps a lazy nested route mounted while params and search change under Await", async () => {
    history.replaceState(null, "", "/users/1?tab=profile");

    let componentRenders = 0;

    function UserPage() {
      componentRenders++;

      return (
        <section>
          <p>{`${$params.id}:${$search.tab}`}</p>
          <div>
            <span>Nested route content</span>
            <button type="button">Static child</button>
          </div>
        </section>
      );
    }

    const LazyUserPage = lazy(() => Promise.resolve({ UserPage }), "UserPage");

    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <Await fallback="Loading">{props.children}</Await>,
        children: [
          {
            path: "/users/:id",
            component: () => <LazyUserPage />,
          },
        ],
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () =>
        Router({
          url: "/users/1?tab=profile",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const initialSection = host.querySelector("section");
    const initialParagraph = host.querySelector("p");
    const initialNestedContent = host.querySelector("span");
    const initialButton = host.querySelector("button");

    expect(initialParagraph?.textContent).toBe("1:profile");
    expect(initialNestedContent?.textContent).toBe("Nested route content");
    expect(initialButton?.textContent).toBe("Static child");
    expect(componentRenders).toBe(1);

    navigate("/users/2?tab=activity");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector("section")).toBe(initialSection);
    expect(host.querySelector("p")).toBe(initialParagraph);
    expect(initialParagraph?.textContent).toBe("2:activity");
    expect(host.querySelector("span")).toBe(initialNestedContent);
    expect(host.querySelector("button")).toBe(initialButton);
    expect(componentRenders).toBe(1);

    navigate("/users/2?tab=settings");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector("section")).toBe(initialSection);
    expect(host.querySelector("p")).toBe(initialParagraph);
    expect(initialParagraph?.textContent).toBe("2:settings");
    expect(host.querySelector("span")).toBe(initialNestedContent);
    expect(host.querySelector("button")).toBe(initialButton);
    expect(componentRenders).toBe(1);

    unmount();
  });
});
