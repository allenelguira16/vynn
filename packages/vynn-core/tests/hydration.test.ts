// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "../src/jsx-runtime";

import {
  getServerRenderedLazyRange,
  withHydration,
} from "../src/client/hydration";
import { $insert } from "../src/render/$insert";
import { $nodes } from "../src/render/$nodes";
import { $state } from "../src/reactivity/$state";
import { NotReadyError } from "../src/reactivity/not-ready-error";
import {
  createOwner,
  disposeOwner,
  runWithOwner,
} from "../src/life-cycle/owner";

describe("hydration DOM preservation", () => {
  it("$insert adds markers around hydrated nodes without moving them", () => {
    const root = document.createElement("div");
    const hydrated = document.createElement("span");
    const after = document.createElement("i");

    hydrated.textContent = "already rendered";
    root.append(hydrated, after);

    const start = document.createTextNode("");
    const end = document.createTextNode("");
    const insertBefore = vi.spyOn(root, "insertBefore");

    $insert(
      root,
      () => [start, hydrated, end] as unknown as JSX.Element,
      after,
    );

    expect([...root.childNodes]).toEqual([start, hydrated, end, after]);
    expect(insertBefore.mock.calls.map(([node]) => node)).not.toContain(hydrated);
    expect(insertBefore.mock.calls.map(([node]) => node)).not.toContain(after);
  });

  it("$nodes preserves the SSR lazy range when the first render suspends", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<!--l:7--><span id="hydrated">already rendered</span><!--/l:7--><i id="after"></i>';

    let range: ReturnType<typeof getServerRenderedLazyRange> = undefined;

    withHydration(() => {
      range = getServerRenderedLazyRange(7);
    }, root);

    expect(range).toBeDefined();

    const hydrated = root.querySelector("#hydrated")!;
    const after = root.querySelector("#after")!;
    const ready = $state(false);
    const owner = createOwner();
    const insertBefore = vi.spyOn(root, "insertBefore");

    try {
      const result = runWithOwner(owner, () =>
        $nodes(() => {
          if (!ready.value) {
            throw new NotReadyError(Promise.resolve());
          }

          return hydrated;
        }, range),
      );

      expect(result).toEqual([range!.start, hydrated, range!.end]);
      expect([...root.childNodes]).toEqual([
        range!.start,
        hydrated,
        range!.end,
        after,
      ]);

      ready.value = true;
      await Promise.resolve();

      expect([...root.childNodes]).toEqual([
        range!.start,
        hydrated,
        range!.end,
        after,
      ]);
      expect(insertBefore.mock.calls.map(([node]) => node)).not.toContain(hydrated);
    } finally {
      disposeOwner(owner);
    }
  });
});
