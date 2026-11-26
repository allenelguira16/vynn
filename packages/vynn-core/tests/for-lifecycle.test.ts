// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { allocateAsyncResourceID } from "../src/runtime/async/runtime";
import {
  createOwner,
  disposeOwner,
  getOwner,
  runWithOwner,
} from "../src/life-cycle/owner";
import { $effect } from "../src/reactivity/effect";
import { $state, type State } from "../src/reactivity/state";
import { $attr } from "../src/render/$attr";
import { $for } from "../src/render/$for";
import { $insert } from "../src/render/$insert";
import { $template } from "../src/render/$template";

type Row = {
  id: number;
  value: State<number>;
};

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("$for row lifecycle", () => {
  it("does not allocate async resource slots for synchronous list indexes", () => {
    const owner = createOwner(null);
    let nextResourceID: string | undefined;

    runWithOwner(owner, () => {
      $for(
        () => [1, 2, 3],
        (item) => item,
      );

      nextResourceID = allocateAsyncResourceID();
    });

    // The list computed value owns the first slot. Per-row indexes are plain
    // synchronous cells and must not consume three more resource identities.
    expect(nextResourceID).toBe("0:1");
    disposeOwner(owner);
  });

  it("updates stable intrinsic rows when an item is replaced with the same key", async () => {
    const rows = $state([{ id: 1, label: "before" }]);
    const owner = createOwner(null);
    const host = document.createElement("div");
    let initialRow: Element | null = null;

    runWithOwner(owner, () => {
      $insert(
        host,
        () =>
          $for(
            () => rows.value,
            (item) => {
              const element = $template("<p></p>")();
              $insert(element, () => item.value.label);
              return element as unknown as JSX.Element;
            },
            (row) => row.id,
            true,
            true,
            false,
          ),
      );
    });

    document.body.append(host);
    await flushEffects();
    initialRow = host.querySelector("p");

    expect(initialRow?.textContent).toBe("before");

    rows.value = [{ id: 1, label: "after" }];
    await flushEffects();

    expect(host.querySelector("p")).toBe(initialRow);
    expect(initialRow?.textContent).toBe("after");

    disposeOwner(owner);
  });

  it("updates tracked indexes when keyed rows are reordered", async () => {
    const rows = $state([{ id: 1 }, { id: 2 }]);
    const owner = createOwner(null);
    const host = document.createElement("div");

    runWithOwner(owner, () => {
      $insert(
        host,
        () =>
          $for(
            () => rows.value,
            (_item, index) => {
              const element = $template("<p></p>")();
              $insert(element, () => index.value);
              return element as unknown as JSX.Element;
            },
            (row) => row.id,
          ),
      );
    });

    document.body.append(host);
    await flushEffects();

    expect(host.textContent).toBe("01");

    const first = rows.value[0]!;
    const second = rows.value[1]!;
    rows.value = [second, first];
    await flushEffects();

    expect(host.textContent).toBe("10");

    disposeOwner(owner);
  });

  it("disposes removed row effects while preserving keyed rows that are reordered", async () => {
    const first: Row = { id: 1, value: $state(0) };
    const second: Row = { id: 2, value: $state(0) };
    const rows = $state([first, second]);
    const owner = createOwner(null);
    const host = document.createElement("div");
    const rowOwners = new Map<number, NonNullable<ReturnType<typeof getOwner>>>();
    const runs = new Map<number, number>([[1, 0], [2, 0]]);

    runWithOwner(owner, () => {
      $insert(
        host,
        () =>
          $for(
            () => rows.value,
            (item) => {
              const row = item.value;
              const rowOwner = getOwner();
              if (!rowOwner) throw new Error("A rendered row must have an owner.");
              rowOwners.set(row.id, rowOwner);

              $effect(() => {
                row.value.value;
                runs.set(row.id, (runs.get(row.id) ?? 0) + 1);
              });

              const element = $template("<p></p>")();
              $attr(element, "data-id", row.id);
              return element as unknown as JSX.Element;
            },
            (row) => row.id,
            true,
            true,
            false,
          ),
      );
    });

    document.body.append(host);
    await flushEffects();

    const firstOwner = rowOwners.get(first.id)!;
    const secondOwner = rowOwners.get(second.id)!;

    expect(firstOwner).toBeDefined();
    expect(secondOwner).toBeDefined();
    expect(
      Object.getOwnPropertySymbols(firstOwner).some(
        (symbol) => symbol.description === "vynn.for.item-state",
      ),
    ).toBe(true);
    expect(owner.children).toContain(firstOwner);
    expect(owner.children).toContain(secondOwner);
    expect(runs.get(1)).toBe(1);
    expect(runs.get(2)).toBe(1);
    expect(
      [...host.querySelectorAll("p")].map((element) => element.dataset.id),
    ).toEqual(["1", "2"]);
    // The stable intrinsic-row fast path keeps only the list's two boundary
    // markers. It does not allocate two additional text markers per row.
    expect([...host.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)).toHaveLength(2);

    // Moving keyed items must preserve their row owners and computations.
    rows.value = [second, first];
    await flushEffects();

    expect(rowOwners.get(first.id)).toBe(firstOwner);
    expect(rowOwners.get(second.id)).toBe(secondOwner);
    expect(firstOwner.disposed).not.toBe(true);
    expect(secondOwner.disposed).not.toBe(true);
    expect(
      [...host.querySelectorAll("p")].map((element) => element.dataset.id),
    ).toEqual(["2", "1"]);

    // Removing one entry disposes all work owned by that row only.
    rows.value = [second];
    await flushEffects();

    expect(firstOwner.disposed).toBe(true);
    expect(secondOwner.disposed).not.toBe(true);
    // Disposed Owners may be retained by debugging tools or application code.
    // They must not keep the removed row's node or reactive item alive.
    expect(
      Object.getOwnPropertySymbols(firstOwner).some(
        (symbol) => symbol.description?.startsWith("vynn.for."),
      ),
    ).toBe(false);
    expect(owner.children).toEqual([secondOwner]);
    expect(
      [...host.querySelectorAll("p")].map((element) => element.dataset.id),
    ).toEqual(["2"]);

    first.value.value = 1;
    second.value.value = 1;

    expect(runs.get(1)).toBe(1);
    expect(runs.get(2)).toBe(2);

    // Disposing the parent still disposes the remaining row scope.
    disposeOwner(owner);
    expect(secondOwner.disposed).toBe(true);
    expect(
      Object.getOwnPropertySymbols(secondOwner).some(
        (symbol) => symbol.description?.startsWith("vynn.for."),
      ),
    ).toBe(false);

    second.value.value = 2;
    expect(runs.get(2)).toBe(2);
  });
});
