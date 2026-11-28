// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { $effect } from "../src/reactivity/effect";
import { $store } from "../src/reactivity/store";
import { createContext } from "../src/components/provider-context";
import { $cmpnt } from "../src/render/$cmpnt";
import { $scope } from "../src/render/$scope";
import { $staticTemplate } from "../src/render/$template";
import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToServer } from "../src/server/render-to-server";
import type { JSX } from "../src/types/jsx";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scoped JSX hydration", () => {
  it("preserves context lookup and store reactivity inside effects", () => {
    const [Provider, useContext] = createContext<{ name: string }>();
    let store!: { name: string };
    let observed = "";
    let disposeEffect = () => {};

    const App = $cmpnt(() => {
      store = $store(() => ({ name: "before" }));

      return Provider({
        value: store,
        get children() {
          const context = useContext();
          disposeEffect = $effect(() => {
            observed = context.name;
          });
          return null;
        },
      });
    });

    App();
    expect(observed).toBe("before");

    store.name = "after";
    expect(observed).toBe("after");
    disposeEffect();
  });

  it("hydrates eager JSX locals independently of their construction and output order", () => {
    const firstTemplate = $staticTemplate("<span>First</span>");
    const secondTemplate = $staticTemplate("<strong>Second</strong>");
    const footerTemplate = $staticTemplate("<footer>Outside</footer>");

    const App = $cmpnt(() => {
      const first = $scope(() => firstTemplate());
      const second = $scope(() => secondTemplate());

      // Constructed first/second, but returned second/first.
      return [second, first, footerTemplate()] as JSX.Element;
    });

    const rendered = renderToServer(() => App(), "sync");
    const host = document.createElement("div");
    host.innerHTML = rendered.body;
    document.body.append(host);

    const serverSecond = host.querySelector("strong");
    const serverFirst = host.querySelector("span");
    const serverFooter = host.querySelector("footer");

    const unmount = hydrateToDOM(() => App(), host);

    expect(host.querySelector("strong")).toBe(serverSecond);
    expect(host.querySelector("span")).toBe(serverFirst);
    expect(host.querySelector("footer")).toBe(serverFooter);
    expect(host.textContent).toBe("SecondFirstOutside");

    unmount();
  });

  it("does not let JSX logged by an effect consume root hydration claims", () => {
    const debugTemplate = $staticTemplate("<div>Hi</div>");
    const mainTemplate = $staticTemplate("<main>Application</main>");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const App = $cmpnt(() => {
      $effect(() => {
        log(debugTemplate());
      });

      return mainTemplate();
    });

    const rendered = renderToServer(() => App(), "sync");
    const host = document.createElement("div");
    host.innerHTML = rendered.body;
    document.body.append(host);

    const serverMain = host.querySelector("main");
    expect(host.querySelector("div")).toBeNull();

    const unmount = hydrateToDOM(() => App(), host);

    expect(host.querySelector("main")).toBe(serverMain);
    expect(host.querySelector("div")).toBeNull();
    expect(host.textContent).toBe("Application");
    expect(log).toHaveBeenCalledTimes(2);

    unmount();
  });
});
