// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { createOwner, disposeOwner, getOwner, runWithOwner } from "../src/life-cycle/owner";
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
          ),
      );
    });

    document.body.append(host);
    await flushEffects();

    const firstOwner = rowOwners.get(first.id)!;
    const secondOwner = rowOwners.get(second.id)!;

    expect(firstOwner).toBeDefined();
    expect(secondOwner).toBeDefined();
    expect(owner.children).toContain(firstOwner);
    expect(owner.children).toContain(secondOwner);
    expect(runs.get(1)).toBe(1);
    expect(runs.get(2)).toBe(1);
    expect([...host.querySelectorAll("p")].map((element) => element.dataset.id)).toEqual(["1", "2"]);

    // Moving keyed items must preserve their row owners and computations.
    rows.value = [second, first];
    await flushEffects();

    expect(rowOwners.get(first.id)).toBe(firstOwner);
    expect(rowOwners.get(second.id)).toBe(secondOwner);
    expect(firstOwner.disposed).not.toBe(true);
    expect(secondOwner.disposed).not.toBe(true);
    expect([...host.querySelectorAll("p")].map((element) => element.dataset.id)).toEqual(["2", "1"]);

    // Removing one entry disposes all work owned by that row only.
    rows.value = [second];
    await flushEffects();

    expect(firstOwner.disposed).toBe(true);
    expect(secondOwner.disposed).not.toBe(true);
    expect(owner.children).toEqual([secondOwner]);
    expect([...host.querySelectorAll("p")].map((element) => element.dataset.id)).toEqual(["2"]);

    first.value.value = 1;
    second.value.value = 1;

    expect(runs.get(1)).toBe(1);
    expect(runs.get(2)).toBe(2);

    // Disposing the parent still disposes the remaining row scope.
    disposeOwner(owner);
    expect(secondOwner.disposed).toBe(true);

    second.value.value = 2;
    expect(runs.get(2)).toBe(2);
  });
});
