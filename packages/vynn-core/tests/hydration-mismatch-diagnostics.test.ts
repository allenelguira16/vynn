import { afterEach, describe, expect, it, vi } from "vitest";

// @vitest-environment jsdom
import {
  finishServerRenderedLazy,
  withHydration,
  withServerRenderedLazy,
} from "../src/client/hydration";
import { initializeHeadContext } from "../src/context/head-context";
import {
  createOwner as createRootOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import { $attr } from "../src/render/$attr";
import { $attr as clientAttr } from "../src/render/client/$attr";
import { $template } from "../src/render/$template";
import { resolveElement } from "../src/render/client/resolve-node";

function createTestOwner() {
  const owner = createRootOwner();
  runWithOwner(owner, initializeHeadContext);
  return owner;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("hydration mismatch diagnostics", () => {
  it("reports and replaces an element with a different tag", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>server</span>";
    const serverElement = root.firstElementChild;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();
    let clientElement!: Element;

    runWithOwner(owner, () => {
      withHydration(() => {
        clientElement = $template("<p></p>")();
      }, root);
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Hydration mismatch: expected element"),
      serverElement,
    );
    expect(clientElement.localName).toBe("p");
    expect(root.firstElementChild).toBeNull();
    expect(serverElement?.parentNode).toBeNull();

    disposeOwner(owner);
  });

  it("reports and repairs text content differences without replacing the node", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>server text</p>";
    const serverText = root.querySelector("p")?.firstChild as Text;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();
    let clientText!: Text;

    runWithOwner(owner, () => {
      withHydration(() => {
        const paragraph = $template("<p>client text</p>")();
        clientText = paragraph.firstChild as Text;
      }, root);
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Hydration mismatch: expected text"),
      serverText,
    );
    expect(clientText).toBe(serverText);
    expect(serverText.data).toBe("client text");

    disposeOwner(owner);
  });

  it("reports attribute differences before applying the client value", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button title="server">Save</button>';
    const serverButton = root.firstElementChild as HTMLButtonElement;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        const button = $template("<button></button>")();
        clientAttr(button, "title", "client");
      }, root);
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Hydration mismatch: expected attribute"),
      serverButton,
    );
    expect(serverButton.getAttribute("title")).toBe("client");

    disposeOwner(owner);
  });

  it.each([
    { value: true, serialized: "true" },
    { value: false, serialized: "false" },
  ])("preserves boolean ARIA values during hydration ($serialized)", ({ value, serialized }) => {
    const root = document.createElement("div");
    root.innerHTML = `<label aria-hidden="${serialized}"></label>`;
    const serverLabel = root.firstElementChild as HTMLLabelElement;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        const label = $template("<label></label>")();
        $attr(label, "aria-hidden", value);
      }, root);
    });

    expect(warn).not.toHaveBeenCalled();
    expect(serverLabel.getAttribute("aria-hidden")).toBe(serialized);

    disposeOwner(owner);
  });

  it("continues to hydrate native HTML boolean attributes as empty attributes", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button disabled=""></button>';
    const serverButton = root.firstElementChild as HTMLButtonElement;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        const button = $template("<button></button>")();
        $attr(button, "disabled", true);
      }, root);
    });

    expect(warn).not.toHaveBeenCalled();
    expect(serverButton.hasAttribute("disabled")).toBe(true);
    expect(serverButton.getAttribute("disabled")).toBe("");

    disposeOwner(owner);
  });

  it("does not report attributes on a replacement element as additional mismatches", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>server</span>";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        const paragraph = $template("<p></p>")();
        $attr(paragraph, "title", "client");
      }, root);
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Hydration mismatch: expected element");
    expect(warn.mock.calls[0]?.[0]).not.toContain("attribute");

    disposeOwner(owner);
  });

  it("reports a missing server-rendered element and creates the client element", () => {
    const root = document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();
    let clientElement!: Element;

    runWithOwner(owner, () => {
      withHydration(() => {
        clientElement = $template("<main></main>")();
      }, root);
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Hydration mismatch: expected element"),
      undefined,
    );
    expect(clientElement.localName).toBe("main");

    disposeOwner(owner);
  });

  it("does not treat updates in a completed lazy scope as hydration while another lazy scope is pending", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--l:999--><span>still loading</span><!--/l:999-->";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        withServerRenderedLazy("100", () => {
          finishServerRenderedLazy("100");

          // This is the kind of new text created when the server function
          // updates the store after onMount.
          const nodes = resolveElement(["hello world 3", "hello world"]);
          expect(nodes.map((node) => node.textContent)).toEqual(["hello world 3", "hello world"]);
        });
      }, root);
    });

    expect(warn).not.toHaveBeenCalled();

    disposeOwner(owner);
  });

  it("keeps delayed child claims active until the lazy boundary queue is consumed", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--l:100--><span>server</span><!--/l:100-->";
    const serverSpan = root.querySelector("span");
    const owner = createTestOwner();
    let clientSpan!: Element;
    let clientText!: Text;

    runWithOwner(owner, () => {
      withHydration(() => {
        withServerRenderedLazy("100", () => {
          finishServerRenderedLazy("100");
          clientSpan = $template("<span>server</span>")();
          clientText = clientSpan.firstChild as Text;
        });
      }, root);
    });

    expect(clientSpan).toBe(serverSpan);
    expect(clientText).toBe(serverSpan?.firstChild);

    disposeOwner(owner);
  });

  it("does not leak a pending lazy hydration scope into later route renders", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--l:100--><span>pending server content</span><!--/l:100-->";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        // Simulate a lazy component whose async child has not claimed its SSR
        // range yet when the user navigates away.
        withServerRenderedLazy("100", () => {});
      }, root);

      // This render is a sibling of the old lazy route, not part of its
      // hydration boundary.
      $template("<p>new route content</p>")();
    });

    expect(warn).not.toHaveBeenCalled();

    disposeOwner(owner);
  });

  it("still diagnoses missing nodes inside an actual server-rendered lazy boundary", () => {
    const root = document.createElement("div");
    root.innerHTML = "<!--l:100--><span></span><!--/l:100-->";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {
        withServerRenderedLazy("100", () => {
          $template("<span>expected from SSR</span>")();
        });
      }, root);
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Hydration mismatch: expected text"),
      undefined,
    );

    disposeOwner(owner);
  });

  it("does not report mismatches for a lazy component introduced by client navigation", () => {
    const root = document.createElement("div");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      withHydration(() => {}, root);

      // The app has already hydrated. This lazy component is now being
      // mounted by client-side navigation and has no SSR range to claim.
      withServerRenderedLazy("100", () => {
        $template("<section>client navigation page</section>")();
        finishServerRenderedLazy("100");
      });
    });

    expect(warn).not.toHaveBeenCalled();

    disposeOwner(owner);
  });

  it("does not report hydration mismatches during ordinary client rendering", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = createTestOwner();

    runWithOwner(owner, () => {
      $template("<main>client-only</main>")();
    });

    expect(warn).not.toHaveBeenCalled();
    disposeOwner(owner);
  });
});
