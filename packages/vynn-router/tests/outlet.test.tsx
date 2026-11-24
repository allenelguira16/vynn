import { describe, expect, it } from "vitest";

import type { Route } from "../src/types";

import { compileRoutes, findRouteBranch } from "../src/matcher";
import { findMatch } from "../src/outlet";

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

    expect(findMatch([dynamic, staticRoute], { pathname: "/about", search: "" })?.route).toBe(
      staticRoute,
    );
    expect(findMatch([staticRoute, dynamic], { pathname: "/about", search: "" })?.route).toBe(
      staticRoute,
    );
  });

  it("prefers a more specific dynamic route", () => {
    const broad = route("/:section/:id");
    const specific = route("/users/:id");

    expect(findMatch([broad, specific], { pathname: "/users/42", search: "" })?.route).toBe(
      specific,
    );
  });

  it("prefers a deeper route when otherwise equally specific", () => {
    const parent = { ...route("/users"), children: [route(":id")] };
    const childLike = route("/users/:id");

    expect(findMatch([parent, childLike], { pathname: "/users/42", search: "" })?.route).toBe(
      childLike,
    );
  });

  it("does not let an empty catch-all match shadow an exact route", () => {
    const home = route("/");
    const optionalWildcard = route("/*?");

    expect(findMatch([optionalWildcard], { pathname: "/", search: "" })?.route).toBe(
      optionalWildcard,
    );
    expect(findMatch([home, optionalWildcard], { pathname: "/", search: "" })?.route).toBe(home);
    expect(findMatch([optionalWildcard, home], { pathname: "/", search: "" })?.route).toBe(home);
    expect(findMatch([route("/*")], { pathname: "/", search: "" })).toBeUndefined();

    const users = route("/users");
    const usersWildcard = route("/users/*?");

    expect(findMatch([users, usersWildcard], { pathname: "/users", search: "" })?.route).toBe(
      users,
    );
    expect(findMatch([usersWildcard, users], { pathname: "/users", search: "" })?.route).toBe(
      users,
    );
  });

  it("uses catch-all routes only when no more specific route matches", () => {
    const wildcard = route("/*");
    const dynamic = route("/:id");
    const staticRoute = route("/about");

    expect(findMatch([wildcard, dynamic], { pathname: "/about", search: "" })?.route).toBe(dynamic);
    expect(findMatch([wildcard, staticRoute], { pathname: "/about", search: "" })?.route).toBe(
      staticRoute,
    );
    expect(findMatch([wildcard], { pathname: "/anything/here", search: "" })?.route).toBe(wildcard);
  });

  it("resolves a complete branch from one compiled tree and preserves route identity", () => {
    const userRoute = route("/users/:id");
    const rootRoute = {
      ...route("/"),
      children: [userRoute],
    };
    const compiled = compileRoutes([rootRoute]);

    const first = findRouteBranch(compiled, { pathname: "/users/1", search: "" });
    const second = findRouteBranch(compiled, { pathname: "/users/2", search: "" });

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0]?.node).toBe(second[0]?.node);
    expect(first[1]?.node).toBe(second[1]?.node);
    expect(first[1]?.fullPath).toBe("/users/:id");
  });

});
