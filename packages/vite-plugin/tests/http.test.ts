import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { addBaseToRequestUrl, isHtmlNavigation, joinAssetBase, toDevUrl } from "../src/plugins/app/http";

function request(
  method: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  return { method, headers } as unknown as IncomingMessage;
}

describe("isHtmlNavigation", () => {
  it("accepts document requests", () => {
    expect(
      isHtmlNavigation(request("GET", { accept: "text/html,application/xhtml+xml" })),
    ).toBe(true);
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "*/*",
          "sec-fetch-dest": "document",
        }),
      ),
    ).toBe(true);
    expect(isHtmlNavigation(request("HEAD", { accept: "text/html" }))).toBe(true);
  });

  it("does not treat generic or subresource requests as document navigations", () => {
    expect(isHtmlNavigation(request("GET", { accept: "*/*" }))).toBe(false);
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "image/avif,image/webp,image/svg+xml,*/*;q=0.8",
          "sec-fetch-dest": "image",
        }),
      ),
    ).toBe(false);
    expect(
      isHtmlNavigation(
        request("GET", {
          accept: "text/html,*/*",
          "sec-fetch-dest": "empty",
        }),
      ),
    ).toBe(false);
    expect(isHtmlNavigation(request("POST", { accept: "text/html" }))).toBe(false);
  });

  it("keeps requests without an Accept header eligible for SSR", () => {
    expect(isHtmlNavigation(request("GET"))).toBe(true);
  });
});


describe("HTTP URL helpers", () => {
  it("normalizes file paths into browser URLs", () => {
    const root = resolve("/project");
    expect(toDevUrl(root, resolve(root, "src", "entry.ts"))).toBe("/src/entry.ts");
  });

  it("joins an asset base without corrupting absolute URLs or slashes", () => {
    expect(joinAssetBase("/", "/assets/app.js")).toBe("/assets/app.js");
    expect(joinAssetBase("/base/", "/assets/app.js")).toBe("/base/assets/app.js");
    expect(joinAssetBase("./", "/assets/app.js")).toBe("./assets/app.js");
    expect(joinAssetBase("https://cdn.example.com/base/", "/assets/app.js")).toBe(
      "https://cdn.example.com/base/assets/app.js",
    );
    expect(joinAssetBase("/", "https://cdn.example.com/app.js")).toBe(
      "https://cdn.example.com/app.js",
    );
  });

  it("adds the base path to incoming request URLs once", () => {
    expect(addBaseToRequestUrl("/base", "/users?active=true")).toBe(
      "/base/users?active=true",
    );
    expect(addBaseToRequestUrl("/base", "/base/users?active=true")).toBe(
      "/base/users?active=true",
    );
  });
});
