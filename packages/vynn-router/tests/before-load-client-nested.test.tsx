// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { Await, type JSX } from "vynn";
import { hydrateToDOM, renderToDOM } from "vynn/client";
import { $insert, $tmpl, $txt } from "vynn/render";
import { redirect, Router, type Route } from "../src";
import { renderToServer } from "vynn/server";

let requestAnimationFrameDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  if (requestAnimationFrameDescriptor) {
    Object.defineProperty(window, "requestAnimationFrame", requestAnimationFrameDescriptor);
    requestAnimationFrameDescriptor = undefined;
  } else {
    Reflect.deleteProperty(window, "requestAnimationFrame");
  }

  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

function node(tag: string, value: string): JSX.Element {
  const element = $tmpl(tag);
  $insert(element, $txt(value));
  return element as unknown as JSX.Element;
}

function PageTemplate(props: { title: string; children: JSX.Element }) {
  return (
    <section>
      <h1>{props.title}</h1>
      {props.children}
    </section>
  );
}

function ParamsPage() {
  return (
    <PageTemplate title="Route Params">
      <p>params route content</p>
    </PageTemplate>
  );
}

describe("client router redirects", () => {
  it("renders a nested component tree after an asynchronous beforeLoad redirect", async () => {
    history.replaceState(null, "", "/redirect");

    const scheduledFrames: FrameRequestCallback[] = [];
    requestAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      },
    });

    let paramsComponentRendered = false;

    function Destination() {
      paramsComponentRendered = true;
      return <ParamsPage />;
    }

    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <Await fallback="Page Is Loading">{props.children}</Await>,
        children: [
          {
            path: "/redirect",
            component: () => node("p", "redirect route must not render"),
            beforeLoad: async () => {
              await Promise.resolve();
              redirect("/params/1?id=1");
            },
          },
          {
            path: "/params/:id",
            component: () => <Destination />,
          },
        ],
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () =>
        Router({
          url: "/redirect",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).not.toContain("redirect route must not render");
    expect(window.location.pathname).toBe("/redirect");
    expect(scheduledFrames).toHaveLength(1);

    // The URL update must wait until the current render has committed.
    scheduledFrames.shift()?.(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/params/1");
    expect(window.location.search).toBe("?id=1");
    expect(paramsComponentRendered).toBe(true);
    expect(host.textContent).toContain("Route Params");
    expect(host.textContent).toContain("params route content");

    unmount();
  });

  it("hydrates the nested route component tree using the existing SSR nodes", async () => {
    const routes: Route[] = [
      {
        path: "/",
        component: (props) => (
          <main>
            <Await fallback="Page Is Loading">{props.children}</Await>
          </main>
        ),
        children: [
          {
            path: "/params/:id",
            component: () => <ParamsPage />,
          },
        ],
      },
    ];

    const rendered = await renderToServer(
      () =>
        Router({
          url: "/params/1",
          routes,
        }) as unknown as JSX.Element,
      "async",
    );

    const host = document.createElement("div");
    host.innerHTML = rendered.body;

    const serverMain = host.querySelector("main");
    const serverSection = host.querySelector("section");
    const serverParagraph = host.querySelector("p");

    expect(serverMain).not.toBeNull();
    expect(serverSection).not.toBeNull();
    expect(serverParagraph).not.toBeNull();

    const unmount = hydrateToDOM(
      () =>
        Router({
          url: "/params/1",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    expect(host.querySelector("main")).toBe(serverMain);
    expect(host.querySelector("section")).toBe(serverSection);
    expect(host.querySelector("p")).toBe(serverParagraph);
    expect(host.textContent).toContain("Route Params");
    expect(host.textContent).toContain("params route content");

    unmount();
  });

});
