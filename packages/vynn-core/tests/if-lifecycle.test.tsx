// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { renderToDOM } from "../src/client/render-to-dom";
import { onDestroy } from "../src/life-cycle/on-destroy";
import { $cmpnt } from "../src/render/$cmpnt";
import { $if } from "../src/render/$if";
import { $insert } from "../src/render/$insert";
import { $template } from "../src/render/$template";
import { $state } from "../src/reactivity/state";

afterEach(() => {
  document.body.innerHTML = "";
});

async function flushUpdates() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("$if branch lifecycle", () => {
  it("mounts nested fragment results from component wrappers without losing the marker", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const first = document.createTextNode("first");
    const second = document.createTextNode("second");
    const Fragment = $cmpnt(() => [first, [second]] as unknown as JSX.Element);
    const unmount = renderToDOM(() => Fragment() as unknown as JSX.Element, host);

    try {
      expect(host.textContent).toBe("firstsecond");
      expect(host.childNodes).toHaveLength(3);
      expect(host.childNodes[0]).toBe(first);
      expect(host.childNodes[1]).toBe(second);
    } finally {
      unmount();
    }
  });

  it("disposes an inactive component branch and mounts a fresh instance when shown again", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    let setVisible!: (value: boolean) => void;
    let renderCount = 0;
    let destroyCount = 0;

    const Branch = $cmpnt(() => {
      renderCount++;
      onDestroy(() => destroyCount++);

      const element = $template("<p>Visible branch</p>")();
      return element as unknown as JSX.Element;
    });

    const unmount = renderToDOM(() => {
      const visible = $state(true);
      setVisible = (value) => {
        visible.value = value;
      };

      const root = $template("<main></main>")();
      $insert(root, () =>
        $if(
          () => visible.value,
          () => Branch(),
          () => document.createTextNode("Hidden branch") as unknown as JSX.Element,
        ),
      );

      return root as unknown as JSX.Element;
    }, host);

    try {
      expect(host.textContent).toBe("Visible branch");
      expect(renderCount).toBe(1);
      expect(destroyCount).toBe(0);

      setVisible(false);
      await flushUpdates();

      expect(host.textContent).toBe("Hidden branch");
      expect(destroyCount).toBe(1);

      setVisible(true);
      await flushUpdates();

      expect(host.textContent).toBe("Visible branch");
      expect(renderCount).toBe(2);
      expect(destroyCount).toBe(1);
    } finally {
      unmount();
    }
  });
});
