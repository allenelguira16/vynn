// @vitest-environment jsdom
import { test } from "vitest";
import * as runtime from "../node_modules/.cache/vynn-runtime-bench/runtime.js";

const {
  $computed,
  $state,
  $store,
  createOwner,
  disposeOwner,
  runWithOwner,
  claimHydrationElement,
  claimHydrationText,
  withHydration,
} = runtime;

let benchmarkSink: unknown;

function assertBenchmarkSink(): void {
  if (benchmarkSink === undefined) {
    throw new Error("The benchmark did not produce a result.");
  }
}

test("store dependency churn and cleanup", async ({ bench }) => {
  benchmarkSink = undefined;

  await bench("64 dynamic keys × 256 updates", () => {
    const owner = createOwner(null);

    runWithOwner(owner, () => {
      const record: Record<string, number> = {};
      for (let index = 0; index < 64; index++) record[`value${index}`] = index;

      const state = $store(record);
      const selectedKey = $state("value0");
      const selectedValue = $computed(() => state[selectedKey.value]);

      for (let index = 0; index < 256; index++) {
        selectedKey.value = `value${index % 64}`;
        benchmarkSink = selectedValue.value;
      }
    });

    disposeOwner(owner);
  }).run();

  assertBenchmarkSink();
});

test("nested store reads across 1k items", async ({ bench }) => {
  const owner = createOwner(null);
  const recomputeNestedRecords = runWithOwner(owner, () => {
    const items = $store(
      Array.from({ length: 1_000 }, (_, index) => ({
        id: index,
        profile: { score: index % 100 },
      })),
    );
    const revision = $state(0);
    const total = $computed(() => {
      revision.value;

      let sum = 0;
      for (const item of items) sum += item.profile.score;
      return sum;
    });

    const recompute = () => {
      revision.value++;
      benchmarkSink = total.value;
    };

    recompute();
    return recompute;
  });

  benchmarkSink = undefined;

  try {
    await bench(
      "recompute a derived total from 1,000 nested records",
      recomputeNestedRecords,
    ).run();

    assertBenchmarkSink();
  } finally {
    disposeOwner(owner);
  }
});

test("hydration scanning and reference release", async ({ bench }) => {
  const root = document.createElement("main");
  root.innerHTML = Array.from(
    { length: 200 },
    (_, index) => `<section><span>${index}</span></section>`,
  ).join("");

  benchmarkSink = undefined;

  await bench("scan and release a 200-node root", () => {
    withHydration(() => {
      for (let index = 0; index < 400; index++) claimHydrationElement();
      for (let index = 0; index < 200; index++) claimHydrationText();
    }, root);

    benchmarkSink = root.childElementCount;
  }).run();

  assertBenchmarkSink();
});
