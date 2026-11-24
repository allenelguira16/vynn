// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { withHydration } from "../src/client/hydration";
import { initializeHeadContext } from "../src/context/head-context";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $nodes } from "../src/render/$nodes";
import { $registerHead } from "../src/render/head-runtime";
import { $text } from "../src/render/$text";
import { renderToServer } from "../src/server/render-to-server";
import type { JSX } from "../src/types/jsx";

function createTestOwner() {
  const owner = createOwner();
  runWithOwner(owner, initializeHeadContext);
  return owner;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("$text", () => {
  it("claims static and dynamic fragment text in source order", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");

    const prefix = document.createTextNode("Prefix: ");
    const dynamic = document.createTextNode("value");
    const suffix = document.createTextNode(" Hi ");

    host.append(prefix, dynamic, suffix);

    let fragment!: JSX.Element;

    runWithOwner(owner, () => {
      withHydration(() => {
        fragment = [
          $text("Prefix: "),
          $nodes(() => "value"),
          $text(" Hi "),
        ];
      }, host);
    });

    const children = fragment as unknown as unknown[];
    const dynamicRange = children[1] as unknown as Node[];

    expect(children[0]).toBe(prefix);
    expect(dynamicRange[1]).toBe(dynamic);
    expect(children[2]).toBe(suffix);

    disposeOwner(owner);
  });

  it("reuses claimed static text without allocating a replacement node", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");
    const existing = document.createTextNode("Already rendered");
    host.append(existing);

    let claimed!: JSX.Element;
    const createTextNode = vi.spyOn(document, "createTextNode");

    try {
      runWithOwner(owner, () => {
        withHydration(() => {
          claimed = $text("Already rendered");
        }, host);
      });

      expect(claimed).toBe(existing);
      expect(createTextNode).not.toHaveBeenCalled();
    } finally {
      createTextNode.mockRestore();
      disposeOwner(owner);
    }
  });

  it("does not claim body text while creating head metadata", () => {
    const owner = createTestOwner();
    const host = document.createElement("div");
    const bodyText = document.createTextNode("body");
    host.append(bodyText);

    let claimed!: Node;

    runWithOwner(owner, () => {
      withHydration(() => {
        $registerHead("title", () => ({ children: $text("title") }));
        claimed = $text("body");
      }, host);
    });

    expect(claimed).toBe(bodyText);

    disposeOwner(owner);
  });

  it("creates an SSR text node that is serialized by the server renderer", () => {
    const result = renderToServer(() => $text("Hello"), "sync");

    expect(result.body).toBe("Hello");
  });
});
