// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { JSX } from "../src/jsx-runtime";

import {
  getServerRenderedLazyRange,
  withHydration,
} from "../src/client/hydration";
import { $insert } from "../src/render/$insert";
import { $nodes } from "../src/render/$nodes";

describe("hydration DOM preservation", () => {
  it("$insert adds markers without reinserting hydrated nodes", () => {
    const root = document.createElement("div");
    const hydrated = document.createElement("span");
    hydrated.textContent = "already rendered";
    root.append(hydrated);

    const start = document.createTextNode("");
    const end = document.createTextNode("");
    const insertBefore = vi.spyOn(root, "insertBefore");

    $insert(
      root,
      () => [start, hydrated, end] as unknown as JSX.Element,
    );

    expect([...root.childNodes]).toEqual([start, hydrated, end]);
    expect(insertBefore.mock.calls.map(([node]) => node)).not.toContain(hydrated);
  });

  it("$nodes reuses lazy SSR boundary markers and preserves existing content", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<!--l:7--><span id="hydrated">already rendered</span><!--/l:7--><i id="after"></i>';

    let range: ReturnType<typeof getServerRenderedLazyRange> = undefined;

    withHydration(() => {
      range = getServerRenderedLazyRange(7);
    }, root);

    expect(range).toBeDefined();

    const hydrated = root.querySelector("#hydrated")!;
    const added = document.createElement("b");
    added.textContent = "new";
    const insertBefore = vi.spyOn(root, "insertBefore");

    const result = $nodes(
      () => [hydrated, added] as unknown as JSX.Element,
      range,
    );

    expect(result).toEqual([range!.start, hydrated, added, range!.end]);
    expect([...root.childNodes]).toEqual([
      range!.start,
      hydrated,
      added,
      range!.end,
      root.querySelector("#after"),
    ]);
    expect(insertBefore.mock.calls.map(([node]) => node)).not.toContain(hydrated);
    expect(insertBefore.mock.calls.map(([node]) => node)).toContain(added);
  });
});
