import type { PropsWithChildren } from "vynn";

import { describe, expect, it } from "vitest";

import {
  createScope,
  disposeScope,
  hydrateRenderNew,
  mountRenderNew,
  prepareRenderNewTree,
  renderTemplateProgramToStringAsync,
  runWithScope,
  type DOMTemplateProgram,
  type RenderNewComponent,
  type RenderScope,
  type TemplateDefinition,
} from "vynn/render_new";

import {
  $params,
  $search,
  createMemoryHistory,
  type BeforeLoadContext,
  createRouter,
  Link,
  Router,
  redirect,
  toFileRouter,
  type Route,
  type RouterInstance,
} from "../src/render-new";

const textTemplate: TemplateDefinition = {
  namespace: "html",
  markup: "<p>placeholder</p>",
  references: [{ id: 0, kind: "text", path: [0, 0] }],
};

const slotTemplate: TemplateDefinition = {
  namespace: "html",
  markup:
    "<section>" +
    "<!--__vynn_render_new_child_0_start__-->" +
    "<!--__vynn_render_new_child_0_end__-->" +
    "</section>",
  references: [{ id: 0, kind: "anchor", path: [0, 0] }],
};

function textProgram(read: () => unknown): DOMTemplateProgram {
  return {
    template: textTemplate,
    bindings: [{ kind: "text", reference: 0, read }],
  };
}

function slotProgram(read: () => unknown): DOMTemplateProgram {
  return {
    template: slotTemplate,
    bindings: [{ kind: "child", reference: 0, read }],
  };
}

function routeComponent(
  render: (props: PropsWithChildren) => DOMTemplateProgram,
): Route["component"] {
  return render as unknown as Route["component"];
}

function routerDispose<TContext>(
  router: RouterInstance<TContext>,
  scope: RenderScope,
) {
  router.dispose();
  disposeScope(scope);
}

function mountRouter(
  routes: Route[],
  initialEntry: string,
  notFound?: Route["component"],
) {
  const scope = createScope(null);
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = runWithScope(
    scope,
    () => createRouter({ routes, history, notFound }),
  );
  const host = window.document.createElement("div");
  const program = runWithScope(
    scope,
    () => Router({ router }) as unknown as RenderNewComponent,
  );
  const mounted = runWithScope(scope, () => mountRenderNew(host, program));

  return {
    host,
    history,
    router,
    dispose() {
      mounted.dispose();
      router.dispose();
      disposeScope(scope);
    },
  };
}

describe("render_new router adapter", () => {
  it("updates dynamic params and search values without remounting the route", () => {
    let renders = 0;
    const UserPage = routeComponent(() => {
      renders += 1;
      return textProgram(() => `${$params.id}:${$search.tab ?? "none"}`);
    });
    const app = mountRouter(
      [{ path: "/users/:id", component: UserPage }],
      "/users/1?tab=profile",
    );

    expect(app.host.textContent).toBe("1:profile");
    expect(renders).toBe(1);

    app.history.push("/users/2?tab=activity");

    expect(app.host.textContent).toBe("2:activity");
    expect(renders).toBe(1);

    app.dispose();
  });

  it("follows a beforeLoad redirect before the first serialization", async () => {
    const PrivatePage = routeComponent(() => textProgram(() => "Private"));
    const LoginPage = routeComponent(() => textProgram(() => "Login"));
    const scope = createScope(null);
    const router = runWithScope(
      scope,
      () => createRouter({
        routes: [
          {
            path: "/private",
            component: PrivatePage,
            beforeLoad: () => redirect("/login"),
          },
          { path: "/login", component: LoginPage },
        ],
        history: createMemoryHistory({ initialEntries: ["/private"] }),
      }),
    );
    const app = runWithScope(
      scope,
      () => Router({ router }) as unknown as RenderNewComponent,
    );

    const html = await renderTemplateProgramToStringAsync(app);

    expect(router.state.location.pathname).toBe("/login");
    expect(html).toContain("Login");
    expect(html).not.toContain("Private");

    routerDispose(router, scope);
  });

  it("hydrates the prepared initial route into existing server DOM", async () => {
    const HomePage = routeComponent(() =>
      textProgram(() => `Route ${$params.id ?? "home"}`),
    );
    const routes: Route[] = [{ path: "/", component: HomePage }];
    const serverScope = createScope(null);
    const serverRouter = runWithScope(
      serverScope,
      () => createRouter({
        routes,
        history: createMemoryHistory({ initialEntries: ["/"] }),
      }),
    );
    const serverApp = runWithScope(
      serverScope,
      () => Router({ router: serverRouter }) as unknown as RenderNewComponent,
    );
    const html = await renderTemplateProgramToStringAsync(serverApp);

    expect(html).toContain("Route home");

    const host = window.document.createElement("div");
    host.innerHTML = html;
    const serverParagraph = host.querySelector("p");

    routerDispose(serverRouter, serverScope);

    const clientScope = createScope(null);
    const clientRouter = runWithScope(
      clientScope,
      () => createRouter({
        routes,
        history: createMemoryHistory({ initialEntries: ["/"] }),
      }),
    );
    const clientApp = runWithScope(
      clientScope,
      () => Router({ router: clientRouter }) as unknown as RenderNewComponent,
    );

    await prepareRenderNewTree(clientApp);
    const mounted = hydrateRenderNew(host, clientApp);

    expect(host.querySelector("p")).toBe(serverParagraph);
    expect(host.textContent).toBe("Route home");

    mounted.dispose();
    clientRouter.dispose();
    disposeScope(clientScope);
  });

  it("preserves an unchanged nested layout while replacing its child route", () => {
    let layoutRenders = 0;
    const DashboardLayout = routeComponent((props) => {
      layoutRenders += 1;
      return slotProgram(() => props.children);
    });
    const SettingsPage = routeComponent(() => textProgram(() => "Settings"));
    const ProfilePage = routeComponent(() => textProgram(() => "Profile"));
    const app = mountRouter(
      [{
        path: "/dashboard",
        component: DashboardLayout,
        children: [
          { path: "settings", component: SettingsPage },
          { path: "profile", component: ProfilePage },
        ],
      }],
      "/dashboard/settings",
    );
    const originalLayout = app.host.querySelector("section");

    expect(originalLayout).not.toBeNull();
    expect(app.host.textContent).toBe("Settings");
    expect(layoutRenders).toBe(1);

    app.history.push("/dashboard/profile");

    expect(app.host.querySelector("section")).toBe(originalLayout);
    expect(app.host.textContent).toBe("Profile");
    expect(layoutRenders).toBe(1);

    app.dispose();
  });

  it("navigates through Link while preserving the native anchor element", () => {
    const HomePage = routeComponent(() =>
      Link({
        href: "/next",
        class: "nav-link",
        activeClass: "active",
        children: "Continue",
      }) as unknown as DOMTemplateProgram,
    );
    const NextPage = routeComponent(() => textProgram(() => "Next route"));
    const app = mountRouter(
      [
        { path: "/", component: HomePage },
        { path: "/next", component: NextPage },
      ],
      "/",
    );
    const anchor = app.host.querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("/next");
    expect(anchor?.className).toContain("nav-link");

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    anchor?.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(app.host.querySelector("a")).toBeNull();
    expect(app.host.textContent).toBe("Next route");

    app.dispose();
  });


  it("waits for async beforeLoad and aborts stale guards on same-route navigation", async () => {
    const pending: Array<{
      resolve: () => void;
      signal: AbortSignal;
      params: Readonly<Record<string, string | undefined>>;
      search: URLSearchParams;
    }> = [];
    const GuardedPage = routeComponent(() =>
      textProgram(() => `${$params.id}:${$search.tab ?? "none"}`),
    );
    const app = mountRouter(
      [{
        path: "/users/:id",
        component: GuardedPage,
        beforeLoad: ({ signal, params, search }) =>
          new Promise<void>((resolve) => {
            pending.push({ resolve, signal, params, search });
          }),
      }],
      "/users/1?tab=profile",
    );

    expect(app.host.textContent).toBe("");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.params.id).toBe("1");
    expect(pending[0]?.search.get("tab")).toBe("profile");

    app.history.push("/users/2?tab=activity");

    expect(pending).toHaveLength(2);
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal.aborted).toBe(false);
    expect(pending[1]?.params.id).toBe("2");
    expect(pending[1]?.search.get("tab")).toBe("activity");

    pending[0]?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.host.textContent).toBe("");

    pending[1]?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.host.textContent).toBe("2:activity");

    app.dispose();
  });

  it("prepares async route guards and lazy modules before SSR serialization", async () => {
    let moduleLoads = 0;
    let guardCalls = 0;
    const filePath = "/src/app/private/page.tsx";
    const PrivatePage = routeComponent(() => textProgram(() => "Protected SSR page"));
    const routes = toFileRouter("/src/app", {
      [filePath]: async () => {
        moduleLoads += 1;
        return {
          default: PrivatePage,
          beforeLoad: async ({ params, location }: BeforeLoadContext) => {
            guardCalls += 1;
            expect(params).toEqual({});
            expect(location.pathname).toBe("/private");
            await Promise.resolve();
          },
        };
      },
    }, [{
      path: filePath,
      kind: "page",
      beforeLoad: true,
    }]);
    const scope = createScope(null);
    const router = runWithScope(
      scope,
      () => createRouter({ routes, url: "/private" }),
    );
    const program = runWithScope(scope, () => Router({ router }));
    const html = await renderTemplateProgramToStringAsync(program as unknown as DOMTemplateProgram);

    expect(moduleLoads).toBe(1);
    expect(guardCalls).toBe(1);
    expect(html).toContain("Protected SSR page");

    router.dispose();
    disposeScope(scope);
  });

  it("commits redirects returned by a route guard", async () => {
    const PrivatePage = routeComponent(() => textProgram(() => "Private"));
    const LoginPage = routeComponent(() => textProgram(() => "Login"));
    const app = mountRouter(
      [
        {
          path: "/private",
          component: PrivatePage,
          beforeLoad: () => redirect("/login"),
        },
        { path: "/login", component: LoginPage },
      ],
      "/private",
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.router.state.location.pathname).toBe("/login");
    expect(app.host.textContent).toBe("Login");

    app.dispose();
  });

  it("renders a file route through the render_new lazy module loader", async () => {
    let moduleLoads = 0;
    let guardCalls = 0;
    const filePath = "/src/app/users/[id]/page.tsx";
    const UserPage = routeComponent(() =>
      textProgram(() => `Lazy user ${$params.id}`),
    );
    const routes = toFileRouter("/src/app", {
      [filePath]: async () => {
        moduleLoads += 1;
        return {
          default: UserPage,
          beforeLoad: async ({ params }: BeforeLoadContext) => {
            guardCalls += 1;
            expect(params.id).toBe("42");
          },
        };
      },
    }, [{
      path: filePath,
      kind: "page",
      beforeLoad: true,
    }]);
    const app = mountRouter(routes, "/users/42");

    expect(app.host.textContent).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(moduleLoads).toBe(1);
    expect(guardCalls).toBe(1);
    expect(app.host.textContent).toBe("Lazy user 42");

    app.dispose();
  });

  it("renders the configured not-found component when no route matches", () => {
    const NotFound = routeComponent(() => textProgram(() => "Not found"));
    const app = mountRouter([], "/missing", NotFound);

    expect(app.host.textContent).toBe("Not found");

    app.dispose();
  });
});
