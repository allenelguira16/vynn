import type { PropsWithChildren } from "vynn";

import { describe, expect, it } from "vitest";

import {
  createDOMTemplateAdapter,
  createScope,
  disposeScope,
  mountTemplateProgram,
  runWithScope,
  type DOMTemplateProgram,
  type TemplateDefinition,
} from "vynn/render_new";

import {
  $params,
  $search,
  createMemoryHistory,
  createRouter,
  Link,
  Router,
  type Route,
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
  const adapter = createDOMTemplateAdapter(window.document);
  const program = runWithScope(
    scope,
    () => Router({ router }) as unknown as DOMTemplateProgram,
  );
  const mounted = runWithScope(
    scope,
    () => mountTemplateProgram(host, program, adapter),
  );

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

  it("renders the configured not-found component when no route matches", () => {
    const NotFound = routeComponent(() => textProgram(() => "Not found"));
    const app = mountRouter([], "/missing", NotFound);

    expect(app.host.textContent).toBe("Not found");

    app.dispose();
  });
});
