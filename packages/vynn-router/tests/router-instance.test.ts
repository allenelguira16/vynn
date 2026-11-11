// @vitest-environment node
import type { JSX } from "vynn";

import { describe, expect, it } from "vitest";
import { renderToServer } from "vynn/server";

import { createMemoryHistory, createRouter, Router, type Route } from "../src";

describe("router instances", () => {
  it("exposes reactive location and instance navigation methods", () => {
    const history = createMemoryHistory({
      initialEntries: ["/users/1?tab=profile"],
    });
    const router = createRouter({
      routes: [],
      history,
    });

    expect(router.state.location).toEqual({
      pathname: "/users/1",
      search: "?tab=profile",
    });

    router.navigate("/users/2?tab=activity");
    expect(router.state.location).toEqual({
      pathname: "/users/2",
      search: "?tab=activity",
    });

    router.replace("/users/3?tab=settings");
    expect(router.state.location).toEqual({
      pathname: "/users/3",
      search: "?tab=settings",
    });

    router.dispose();
  });

  it("tracks memory history back and forward without mounting a component", () => {
    const history = createMemoryHistory({
      initialEntries: ["/first", "/second"],
    });
    const router = createRouter({
      routes: [],
      history,
    });

    expect(router.state.location.pathname).toBe("/second");

    history.back();
    expect(router.state.location.pathname).toBe("/first");

    history.forward();
    expect(router.state.location.pathname).toBe("/second");

    router.dispose();
  });

  it("keeps server router locations isolated between instances", () => {
    const first = createRouter({
      routes: [],
      url: "/first?request=one",
    });
    const second = createRouter({
      routes: [],
      url: "/second?request=two",
    });

    expect(first.state.location).toEqual({
      pathname: "/first",
      search: "?request=one",
    });
    expect(second.state.location).toEqual({
      pathname: "/second",
      search: "?request=two",
    });

    first.navigate("/first/next");
    expect(first.state.location.pathname).toBe("/first/next");
    expect(second.state.location.pathname).toBe("/second");

    first.dispose();
    second.dispose();
  });

  it("provides router context to synchronous beforeLoad functions", async () => {
    type Context = { tenant: string };
    let tenant: string | undefined;

    const routes: Route<Context>[] = [
      {
        path: "/",
        beforeLoad: ({ context }) => {
          tenant = context.tenant;
        },
        component: () => "Tenant page",
      },
    ];
    const router = createRouter({
      routes,
      context: { tenant: "north" },
      url: "/",
    });

    const rendered = await renderToServer(
      () => Router({ router }) as unknown as JSX.Element,
      "async",
    );

    expect(tenant).toBe("north");
    expect(rendered.body).toContain("Tenant page");

    router.dispose();
  });
});
