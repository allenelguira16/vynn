// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INTERNAL_RANGE_END_MARKER,
  INTERNAL_RANGE_START_MARKER,
} from "../src/const";
import {
  beginHydrationClaim,
  claimHydrationElement,
  claimHydrationText,
  finishServerRenderedLazy,
  getServerRenderedLazyRange,
  isHydrating,
  rollbackHydrationClaim,
  withHydration,
  withServerRenderedLazy,
} from "../src/client/hydration";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("hydration DOM traversal", () => {
  it("scans nested and internal ranges without creating childNodes collections", () => {
    const root = document.createElement("div");
    const rangeStart = document.createComment(INTERNAL_RANGE_START_MARKER);
    const section = document.createElement("section");
    const nestedStart = document.createComment(INTERNAL_RANGE_START_MARKER);
    const paragraph = document.createElement("p");
    paragraph.textContent = "inside";
    const nestedEnd = document.createComment(INTERNAL_RANGE_END_MARKER);
    const rangeEnd = document.createComment(INTERNAL_RANGE_END_MARKER);
    const outside = document.createElement("footer");

    section.append(nestedStart, paragraph, nestedEnd);
    root.append(rangeStart, section, rangeEnd, outside);

    const childNodesGetter = vi
      .spyOn(Node.prototype, "childNodes", "get")
      .mockImplementation(() => {
        throw new Error("Hydration traversal must not materialize childNodes NodeLists.");
      });

    try {
      expect(() => withHydration(() => {}, root)).not.toThrow();
    } finally {
      childNodesGetter.mockRestore();
    }

    expect(rangeStart.parentNode).toBeNull();
    expect(rangeEnd.parentNode).toBeNull();
    expect(nestedStart.parentNode).toBeNull();
    expect(nestedEnd.parentNode).toBeNull();

    const owner = createOwner(null);
    runWithOwner(owner, () => {
      // Internal ranges are opaque to the ordinary hydration node queue.
      expect(claimHydrationElement()).toBe(outside);
    });
    disposeOwner(owner);
  });
});

describe("lazy hydration text anchors", () => {
  it("replaces lazy boundary comments with empty text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML =
      "<!--l:00--><div>outer</div><!--l:000--><span>nested</span><!--/l:000--><p>after nested</p><!--/l:00--><strong>root</strong>";

    const rootElement = root.querySelector("strong");

    withHydration(() => {}, root);

    const outerRange = getServerRenderedLazyRange("00");
    const nestedRange = getServerRenderedLazyRange("000");

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

describe("lazy hydration reference cleanup", () => {
  it("releases completed lazy DOM ranges and node queues", () => {
    const root = document.createElement("div");
    root.innerHTML = '<!--l:00--><section id="lazy">content</section><!--/l:00--><footer id="root">root</footer>';

    const lazyElement = root.querySelector("#lazy");
    const lazyText = lazyElement?.firstChild;
    const rootElement = root.querySelector("#root");
    const rootText = rootElement?.firstChild;

    withHydration(() => {}, root);
    expect(isHydrating()).toBe(true);
    expect(getServerRenderedLazyRange("00")).toBeDefined();

    const owner = createOwner(null);
    runWithOwner(owner, () => {
      withServerRenderedLazy("00", () => {
        expect(claimHydrationElement()).toBe(lazyElement);
        expect(claimHydrationText()).toBe(lazyText);
        finishServerRenderedLazy("00");
      });

      expect(claimHydrationElement()).toBe(rootElement);
      expect(claimHydrationText()).toBe(rootText);
    });

    expect(getServerRenderedLazyRange("00")).toBeUndefined();
    expect(isHydrating()).toBe(false);
    disposeOwner(owner);
  });
});

describe("lazy hydration cursor isolation", () => {
  it("hydrates sibling and nested lazy ranges independently of resolution order", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<!--l:00--><div id="first">one</div><!--l:000--><span id="nested">nested</span><!--/l:000--><p id="tail">tail</p><!--/l:00--><!--l:01--><article id="second">two</article><!--/l:01--><footer id="root">root</footer>';

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
      withServerRenderedLazy("01", () => {
        expect(claimHydrationElement()).toBe(second);
        expect(claimHydrationText()).toBe(secondText);
      });
    });

    // The first parent's queue excludes the nested lazy range.
    runWithOwner(firstOwner, () => {
      withServerRenderedLazy("00", () => {
        expect(claimHydrationElement()).toBe(first);
        expect(claimHydrationText()).toBe(firstText);
        expect(claimHydrationElement()).toBe(tail);
        expect(claimHydrationText()).toBe(tailText);
      });
    });

    runWithOwner(nestedOwner, () => {
      withServerRenderedLazy("000", () => {
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
    root.innerHTML = '<!--l:00--><section id="preserved">content</section><!--/l:00-->';

    const serverElement = root.querySelector("#preserved");
    withHydration(() => {}, root);

    const owner = createOwner(null);

    runWithOwner(owner, () => {
      withServerRenderedLazy("00", () => {
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


describe("Owner identity marker parsing", () => {
  it("accepts compressed zero runs and base36 width markers in Owner IDs", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<!--l:0~3--><div id="parent"><!--l:0~A10a--><span id="nested">ten</span><!--/l:0~A10a--></div><!--/l:0~3-->';

    withHydration(() => {}, root);

    const parentRange = getServerRenderedLazyRange("0~3");
    const nestedRange = getServerRenderedLazyRange("0~A10a");

    expect(parentRange).toBeDefined();
    expect(nestedRange).toBeDefined();
    expect(nestedRange?.nodes).toContain(root.querySelector("#nested"));
  });
});
