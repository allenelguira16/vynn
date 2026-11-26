// @vitest-environment jsdom
import { bench, describe } from "vitest";

import { $computed } from "../src/reactivity/computed";
import { $state } from "../src/reactivity/state";
import { $store } from "../src/reactivity/store";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import {
  claimHydrationElement,
  claimHydrationText,
  withHydration,
} from "../src/client/hydration";

describe("Vynn runtime", () => {
  bench("store: dynamic dependency churn and cleanup", () => {
    const owner = createOwner(null);

    runWithOwner(owner, () => {
      const record: Record<string, number> = {};
      for (let index = 0; index < 64; index++) record[`value${index}`] = index;

      const state = $store(record);
      const selectedKey = $state("value0");
      const selectedValue = $computed(() => state[selectedKey.value]);

      for (let index = 0; index < 256; index++) {
        selectedKey.value = `value${index % 64}`;
        void selectedValue.value;
      }
    });

    disposeOwner(owner);
  });

  bench("store: nested reads across a 1k-item collection", () => {
    const owner = createOwner(null);

    runWithOwner(owner, () => {
      const items = $store(
        Array.from({ length: 1_000 }, (_, index) => ({
          id: index,
          profile: { score: index % 100 },
        })),
      );
      const total = $computed(() =>
        items.reduce((sum, item) => sum + item.profile.score, 0),
      );
      void total.value;
    });

    disposeOwner(owner);
  });

  bench("hydration: scan and release a 200-node root", () => {
    const root = document.createElement("main");
    const markup = Array.from(
      { length: 200 },
      (_, index) => `<section><span>${index}</span></section>`,
    ).join("");
    root.innerHTML = markup;

    withHydration(() => {
      for (let index = 0; index < 400; index++) claimHydrationElement();
      for (let index = 0; index < 200; index++) claimHydrationText();
    }, root);
  });
});
