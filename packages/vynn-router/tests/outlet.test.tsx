import { describe, expect, it } from "vitest";

import { findMatch } from "../src/outlet";
import type { Route } from "../src/types";

function route(path: string): Route {
  return {
    path,
    component: (() => null) as Route["component"],
  };
}

describe("route matching", () => {
  it("prefers static routes over dynamic routes regardless of declaration order", () => {
    const dynamic = route("/:id");
    const staticRoute = route("/about");

    expect(findMatch([dynamic, staticRoute], { pathname: "/about", search: "" })?.route)
      .toBe(staticRoute);
    expect(findMatch([staticRoute, dynamic], { pathname: "/about", search: "" })?.route)
      .toBe(staticRoute);
  });

  it("prefers a more specific dynamic route", () => {
    const broad = route("/:section/:id");
    const specific = route("/users/:id");

    expect(findMatch([broad, specific], { pathname: "/users/42", search: "" })?.route)
      .toBe(specific);
  });

  it("prefers a deeper route when otherwise equally specific", () => {
    const parent = { ...route("/users"), children: [route(":id")] };
    const childLike = route("/users/:id");

    expect(findMatch([parent, childLike], { pathname: "/users/42", search: "" })?.route)
      .toBe(childLike);
  });

  it("uses catch-all routes only when no more specific route matches", () => {
    const wildcard = route("/*");
    const dynamic = route("/:id");
    const staticRoute = route("/about");

    expect(findMatch([wildcard, dynamic], { pathname: "/about", search: "" })?.route)
      .toBe(dynamic);
    expect(findMatch([wildcard, staticRoute], { pathname: "/about", search: "" })?.route)
      .toBe(staticRoute);
    expect(findMatch([wildcard], { pathname: "/anything/here", search: "" })?.route)
      .toBe(wildcard);
  });
});
