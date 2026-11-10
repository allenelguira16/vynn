import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToDOM } from "vynn/client";

import { Link } from "../src/link";
import { setActiveLocation } from "../src/location";

type LinkProps = Parameters<typeof Link>[0];

let unmount: (() => void) | undefined;

describe("Link", () => {
  afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    setActiveLocation({ pathname: "/", search: "" });
  });

  function renderLinks(props: LinkProps[]): HTMLAnchorElement[] {
    setActiveLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });

    unmount = renderToDOM(
      () => (
        <>
          {props.map((linkProps) => (
            <Link {...linkProps} />
          ))}
        </>
      ),
      document.body,
    );

    return Array.from(document.body.querySelectorAll<HTMLAnchorElement>("a"));
  }

  it("matches active links by pathname while ignoring query strings and hashes", () => {
    window.history.replaceState(null, "", "/users?tab=profile");

    const [differentQuery, hashLink, relativeQuery, otherPath] = renderLinks([
      { href: "/users?tab=settings", activeClass: "active", children: "Settings" },
      { href: "/users#details", activeClass: "active", children: "Details" },
      { href: "?tab=activity", activeClass: "active", children: "Activity" },
      { href: "/teams?tab=profile", activeClass: "active", children: "Teams" },
    ]);

    expect(differentQuery.classList.contains("active")).toBe(true);
    expect(hashLink.classList.contains("active")).toBe(true);
    expect(relativeQuery.classList.contains("active")).toBe(true);
    expect(otherPath.classList.contains("active")).toBe(false);
  });

  it("intercepts an ordinary same-origin primary click", () => {
    window.history.replaceState(null, "", "/");
    const [link] = renderLinks([{ href: "/users?sort=name", children: "Users" }]);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });

    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe("/users");
    expect(window.location.search).toBe("?sort=name");
  });

  it.each([
    ["middle click", { button: 1 }],
    ["ctrl click", { button: 0, ctrlKey: true }],
    ["meta click", { button: 0, metaKey: true }],
    ["shift click", { button: 0, shiftKey: true }],
    ["alt click", { button: 0, altKey: true }],
  ])("preserves native behavior for %s", (_label, init) => {
    // Hash-only navigation is supported by jsdom. Using it keeps this test
    // focused on whether Link leaves the event untouched, not document loads.
    const [link] = renderLinks([{ href: "#native", children: "Users" }]);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });

    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("preserves native behavior for downloads and non-self targets", () => {
    const [download, blank] = renderLinks([
      { href: "#download", download: true, children: "Download" },
      { href: "#blank", target: "_blank", children: "New tab" },
    ]);

    const downloadEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    download.dispatchEvent(downloadEvent);
    expect(downloadEvent.defaultPrevented).toBe(false);

    const blankEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    blank.dispatchEvent(blankEvent);
    expect(blankEvent.defaultPrevented).toBe(false);
  });

  it("does not stop propagation when handling internal navigation", () => {
    const [link] = renderLinks([{ href: "/users", children: "Users" }]);
    const bubbled = vi.fn();
    document.body.addEventListener("click", bubbled);

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(bubbled).toHaveBeenCalledOnce();
    document.body.removeEventListener("click", bubbled);
  });
});
