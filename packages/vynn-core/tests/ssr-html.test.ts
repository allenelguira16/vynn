import { describe, expect, it } from "vitest";

import {
  $ssrAttribute,
  $ssrJoin,
  $ssrJoinChildren,
  $ssrLogical,
  $ssrRaw,
  $ssrSpread,
  $ssrText,
} from "../src/server/ssr-html";

describe("SSR string HTML helpers", () => {
  it("escapes dynamic text and ignores empty JSX values", () => {
    expect($ssrText(`<img src="x" onerror="alert(1)">'&`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;&#39;&amp;",
    );
    expect($ssrText([1, " <b>", null, false, "&"])).toBe("1 &lt;b&gt;&amp;");
    expect($ssrText(false)).toBe("");
    expect($ssrText(null)).toBe("");
    expect($ssrText("")).toBe("<!--$0-->");
  });

  it("joins already-compiled JSX output without escaping it again", () => {
    expect($ssrJoin(["<b>", ["safe markup"], "</b>"])).toBe("<b>safe markup</b>");
    expect($ssrJoin(null)).toBe("");
    expect($ssrJoin("")).toBe("<!--$0-->");
  });

  it("preserves adjacent text nodes with hydration separator comments", () => {
    expect($ssrJoinChildren(["Hi ", "First name"])).toBe("Hi <!--/-->First name");
    expect($ssrJoinChildren(["<span>", "First name", "</span>"])).toBe(
      "<span>First name</span>",
    );
    expect(
      $ssrJoinChildren([
        "Before ",
        "<!--s:1:0--><!--/s:1:0-->",
        "<!--$v0-->",
        " after",
      ]),
    ).toBe(
      "Before <!--/--><!--s:1:0--><!--/s:1:0--><!--$v0--> after",
    );
    expect(
      $ssrJoinChildren([
        "Before ",
        "<!--s:1:0--><!--/s:1:0-->",
        " after",
      ]),
    ).toBe(
      "Before <!--/--><!--s:1:0--><!--/s:1:0--><!--/--> after",
    );
  });

  it("serializes boolean, aliased, style, and SVG attributes", () => {
    expect($ssrAttribute("disabled", true)).toBe(' disabled=""');
    expect($ssrAttribute("disabled", false)).toBe("");
    expect($ssrAttribute("title", () => "safe value")).toBe(' title="safe value"');
    expect($ssrAttribute("aria-hidden", false)).toBe(' aria-hidden="false"');
    expect($ssrAttribute("className", "primary")).toBe(' class="primary"');
    expect($ssrAttribute("style", { backgroundColor: "red", marginTop: 2 })).toBe(
      ' style="background-color:red;margin-top:2"',
    );
    expect($ssrAttribute("strokeWidth", 2, true)).toBe(' stroke-width="2"');
    expect($ssrAttribute("viewBox", "0 0 10 10", true)).toBe(' viewBox="0 0 10 10"');
  });

  it("omits component-only, ref, and event props from host markup", () => {
    expect($ssrAttribute("children", "ignored")).toBe("");
    expect($ssrAttribute("ref", "ignored")).toBe("");
    expect($ssrAttribute("onClick", "ignored")).toBe("");
    expect(() => $ssrAttribute("onclick", "alert(1)")).toThrow();
  });

  it("serializes spread values and invokes accessor-like function values", () => {
    expect(
      $ssrSpread({
        id: "main",
        disabled: true,
        onClick: () => undefined,
        ref: () => undefined,
        title: () => "hello",
      }),
    ).toBe(' id="main" disabled="" title="hello"');
  });

  it("preserves short-circuit rendering and escapes text operands", () => {
    expect($ssrLogical(0, "&&", () => "<b>raw</b>")).toBe("0");
    expect($ssrLogical("<", "||", () => "fallback")).toBe("&lt;");
    expect($ssrLogical(null, "??", () => "<b>raw</b>")).toBe("<b>raw</b>");
  });

  it("preserves script and style raw-text semantics", () => {
    expect($ssrJoin(() => `const value = "</script>"`, false, "script")).toBe(
      'const value = "<\\/script>"',
    );
    expect($ssrJoin(() => `a { content: "<"; }`, false, "style")).toBe(
      'a { content: "\\3C "; }',
    );
  });
  it("inserts explicitly raw HTML without escaping it", () => {
    expect($ssrRaw("<strong>trusted</strong>")).toBe("<strong>trusted</strong>");
    expect($ssrRaw(null)).toBe("");
  });
});
