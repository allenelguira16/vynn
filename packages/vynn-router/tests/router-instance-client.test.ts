// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createRouter, navigate } from "../src";

afterEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

describe("client router instances", () => {
  it("tracks instance navigation and browser popstate changes", () => {
    history.replaceState(null, "", "/before");

    const router = createRouter({
      routes: [],
      url: "/start",
    });

    expect(window.location.pathname).toBe("/start");
    expect(router.state.location.pathname).toBe("/start");

    router.navigate("/next?tab=one");

    expect(window.location.pathname).toBe("/next");
    expect(window.location.search).toBe("?tab=one");
    expect(router.state.location).toEqual({
      pathname: "/next",
      search: "?tab=one",
    });

    history.replaceState(null, "", "/from-popstate?tab=back");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(router.state.location).toEqual({
      pathname: "/from-popstate",
      search: "?tab=back",
    });

    // The legacy helper still targets the active browser router when called
    // outside a route owner.
    navigate("/from-global?tab=helper");

    expect(window.location.pathname).toBe("/from-global");
    expect(window.location.search).toBe("?tab=helper");
    expect(router.state.location).toEqual({
      pathname: "/from-global",
      search: "?tab=helper",
    });

    router.dispose();
  });
});
