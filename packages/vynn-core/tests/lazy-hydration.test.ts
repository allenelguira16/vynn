import { afterEach, describe, expect, it } from "vitest";
import {
  beginHydrationClaim,
  claimHydrationElement,
  claimHydrationText,
  getServerRenderedLazyRange,
  rollbackHydrationClaim,
  withHydration,
  withServerRenderedLazy,
} from "../src/client/hydration";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";

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

    expect(outerRange?.start.parentNode).toBe(root);
    expect(outerRange?.end.parentNode).toBe(root);
    expect(nestedRange?.start.parentNode).toBe(root);
    expect(nestedRange?.end.parentNode).toBe(root);

    const comments = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    expect(comments.nextNode()).toBeNull();

    // Lazy nodes stay out of the root hydration queue.
    const rootOwner = createOwner(null);
    runWithOwner(rootOwner, () => {
      expect(claimHydrationElement()).toBe(rootElement);
    });
    disposeOwner(rootOwner);
  });
});

describe("lazy hydration cursor isolation", () => {
  it("hydrates sibling and nested lazy ranges independently of resolution order", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<!--l:0--><div id="first">one</div><!--l:0.0--><span id="nested">nested</span><!--/l:0.0--><p id="tail">tail</p><!--/l:0--><!--l:1--><article id="second">two</article><!--/l:1--><footer id="root">root</footer>';

    const first = root.querySelector("#first");
    const nested = root.querySelector("#nested");
    const tail = root.querySelector("#tail");
    const second = root.querySelector("#second");
    const footer = root.querySelector("#root");

    const firstText = first?.firstChild;
    const nestedText = nested?.firstChild;
    const tailText = tail?.firstChild;
    const secondText = second?.firstChild;
    const footerText = footer?.firstChild;

    withHydration(() => {}, root);

    const rootOwner = createOwner(null);
    const firstOwner = createOwner(rootOwner);
    const nestedOwner = createOwner(firstOwner);
    const secondOwner = createOwner(rootOwner);

    // Resolve the second sibling before the first parent module.
    runWithOwner(secondOwner, () => {
      withServerRenderedLazy("1", () => {
        expect(claimHydrationElement()).toBe(second);
        expect(claimHydrationText()).toBe(secondText);
      });
    });

    // The first parent's queue excludes the nested lazy range.
    runWithOwner(firstOwner, () => {
      withServerRenderedLazy("0", () => {
        expect(claimHydrationElement()).toBe(first);
        expect(claimHydrationText()).toBe(firstText);
        expect(claimHydrationElement()).toBe(tail);
        expect(claimHydrationText()).toBe(tailText);
      });
    });

    runWithOwner(nestedOwner, () => {
      withServerRenderedLazy("0.0", () => {
        expect(claimHydrationElement()).toBe(nested);
        expect(claimHydrationText()).toBe(nestedText);
      });
    });

    // Root hydration remains independent from every lazy boundary.
    runWithOwner(rootOwner, () => {
      expect(claimHydrationElement()).toBe(footer);
      expect(claimHydrationText()).toBe(footerText);
    });

    disposeOwner(rootOwner);
  });

  it("rolls back node claims when a render attempt suspends", () => {
    const root = document.createElement("div");
    root.innerHTML = '<!--l:0--><section id="preserved">content</section><!--/l:0-->';

    const serverElement = root.querySelector("#preserved");
    withHydration(() => {}, root);

    const owner = createOwner(null);

    runWithOwner(owner, () => {
      withServerRenderedLazy("0", () => {
        const snapshot = beginHydrationClaim();

        expect(claimHydrationElement()).toBe(serverElement);

        rollbackHydrationClaim(snapshot);

        // The retry must see the same SSR node, not the next item in a
        // shared global queue.
        expect(claimHydrationElement()).toBe(serverElement);
      });
    });

    disposeOwner(owner);
  });
});
