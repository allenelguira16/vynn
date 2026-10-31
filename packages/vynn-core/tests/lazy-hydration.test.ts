import { afterEach, describe, expect, it } from "vitest";
import {
  claimHydrationElement,
  getServerRenderedLazyRange,
  withHydration,
} from "../src/client/hydration";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("lazy hydration text anchors", () => {
  it("replaces lazy boundary comments with empty text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML =
      "<!--l:1--><div>outer</div><!--l:2--><span>nested</span><!--/l:2--><p>after nested</p><!--/l:1--><strong>root</strong>";

    const rootElement = root.querySelector("strong");

    withHydration(() => {}, root);

    const outerRange = getServerRenderedLazyRange(1);
    const nestedRange = getServerRenderedLazyRange(2);

    expect(outerRange).toBeDefined();
    expect(nestedRange).toBeDefined();

    expect(outerRange?.start).toBeInstanceOf(Text);
    expect(outerRange?.end).toBeInstanceOf(Text);
    expect(outerRange?.start.data).toBe("");
    expect(outerRange?.end.data).toBe("");

    expect(nestedRange?.start).toBeInstanceOf(Text);
    expect(nestedRange?.end).toBeInstanceOf(Text);
    expect(nestedRange?.start.data).toBe("");
    expect(nestedRange?.end.data).toBe("");

    expect(outerRange?.nodes.map((node) => node.nodeName)).toEqual([
      "DIV",
      "#text",
      "SPAN",
      "#text",
      "P",
    ]);
    expect(nestedRange?.nodes.map((node) => node.nodeName)).toEqual(["SPAN"]);

    expect(outerRange?.start.parentNode).toBe(root);
    expect(outerRange?.end.parentNode).toBe(root);
    expect(nestedRange?.start.parentNode).toBe(root);
    expect(nestedRange?.end.parentNode).toBe(root);

    const comments = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    expect(comments.nextNode()).toBeNull();

    // Lazy nodes stay out of the root hydration queue.
    expect(claimHydrationElement()).toBe(rootElement);
  });
});
