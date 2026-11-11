import { describe, expect, it } from "vitest";

import {
  getRouteParam,
  getRouteParams,
  isCatchAllPath,
  joinPaths,
  matchRoute,
  normalizePath,
  toSegments,
} from "../src/path";

const location = (pathname: string) => ({ pathname, search: "" });

describe("path utilities", () => {
  it("normalizes repeated and trailing slashes", () => {
    expect(normalizePath("//users///allen/")).toBe("/users/allen");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/")).toBe("/");
  });

  it("splits normalized paths into segments", () => {
    expect(toSegments("//users/allen/")).toEqual(["users", "allen"]);
    expect(toSegments("/")).toEqual([]);
  });

  it("joins parent and child paths without duplicate separators", () => {
    expect(joinPaths("/users/", "/:id/")).toBe("/users/:id");
    expect(joinPaths("/", "about")).toBe("/about");
    expect(joinPaths("/users", "")).toBe("/users");
  });

  it("matches static, dynamic, nested and catch-all paths", () => {
    expect(matchRoute("/users/:id", true, location("/users/42"))).toBe(true);
    expect(matchRoute("/users/:id", true, location("/users/42/edit"))).toBe(false);
    expect(matchRoute("/users/*", true, location("/users/42/edit"))).toBe(true);
    expect(matchRoute("/users", false, location("/users/42"))).toBe(true);
    expect(matchRoute("/users", true, location("/users/42"))).toBe(false);
    expect(matchRoute("/", true, location("/"))).toBe(true);
  });

  it("detects only terminal catch-all segments", () => {
    expect(isCatchAllPath("/files/*")).toBe(true);
    expect(isCatchAllPath("/files/:name")).toBe(false);
  });

  it("decodes dynamic and catch-all parameters", () => {
    const current = location("/users/Allen%20Elguira/files/a%2Fb/c");
    expect(getRouteParam("/users/:id", "id", current)).toBe("Allen Elguira");
    expect(getRouteParam("/users/:id/files/*", "*", current)).toBe("a/b/c");
    expect(getRouteParams("/users/:id/files/*", current)).toEqual({
      id: "Allen Elguira",
      "*": "a/b/c",
    });
  });

  it("does not throw on malformed percent escapes", () => {
    expect(getRouteParam("/users/:id", "id", location("/users/%E0%A4%A"))).toBe("%E0%A4%A");
  });

  it("distinguishes required and optional catch-all segments", () => {
    expect(matchRoute("/files/*", true, location("/files"))).toBe(false);
    expect(matchRoute("/files/*", true, location("/files/a"))).toBe(true);

    expect(matchRoute("/files/*?", true, location("/files"))).toBe(true);
    expect(getRouteParams("/files/*?", location("/files"))).toEqual({ "*": "" });
    expect(getRouteParams("/files/*", location("/files"))).toEqual({});
  });

  it("returns no parameter when the route prefix does not match", () => {
    expect(getRouteParam("/users/:id", "id", location("/posts/42"))).toBeUndefined();
    expect(getRouteParams("/users/:id", location("/posts/42"))).toEqual({});
  });
});
