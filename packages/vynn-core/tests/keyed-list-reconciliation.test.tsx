// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderToDOM } from "../src/client/render-to-dom";
import { $state } from "../src/reactivity/state";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("keyed list reconciliation", () => {
  it("warns once when a non-empty JSX list has no key", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => (
        <ul>
          {[1, 2].map(value => <li>{value}</li>)}
        </ul>
      ),
      host,
    );

    try {
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining("Each child in a list should have a unique"),
      );
    } finally {
      unmount();
      warning.mockRestore();
    }
  });

  it("does not warn when every JSX list row has an explicit key", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => (
        <ul>
          {[{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }].map(user => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      ),
      host,
    );

    try {
      expect(warning).not.toHaveBeenCalled();
    } finally {
      unmount();
      warning.mockRestore();
    }
  });

  it("preserves component owners and local state across object replacement and reordering", () => {
    let componentCalls = 0;
    let replaceUsers!: (users: Array<{ id: number; name: string }>) => void;

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(() => {
      const users = $state([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);
      replaceUsers = (nextUsers) => {
        users.value = nextUsers;
      };

      function UserRow(props: { id: number; name: string }) {
        componentCalls++;
        const pressed = $state(false);

        return (
          <li>
            <button
              data-id={props.id}
              aria-pressed={pressed.value}
              onClick={() => {
                pressed.value = !pressed.value;
              }}
            >
              {props.name}
            </button>
          </li>
        );
      }

      return (
        <ul>
          {users.value.map(user => (
            <UserRow key={user.id} id={user.id} name={user.name} />
          ))}
        </ul>
      );
    }, host);

    try {
      expect(componentCalls).toBe(2);

      const aliceButton = host.querySelector<HTMLButtonElement>('button[data-id="1"]');
      expect(aliceButton).not.toBeNull();

      aliceButton!.click();
      expect(aliceButton!.getAttribute("aria-pressed")).toBe("true");

      // New object snapshots with the same IDs update the existing item cells.
      replaceUsers([
        { id: 1, name: "Alice Updated" },
        { id: 2, name: "Bobby" },
      ]);

      expect(componentCalls).toBe(2);
      expect(host.querySelector('button[data-id="1"]')).toBe(aliceButton);
      expect(aliceButton!.textContent).toBe("Alice Updated");
      expect(aliceButton!.getAttribute("aria-pressed")).toBe("true");

      // Reordering moves the existing DOM and keeps each component's local state.
      replaceUsers([
        { id: 2, name: "Bobby Updated" },
        { id: 1, name: "Alice Revised" },
      ]);

      expect(componentCalls).toBe(2);
      expect(host.querySelectorAll("button")[1]).toBe(aliceButton);
      expect(aliceButton!.textContent).toBe("Alice Revised");
      expect(aliceButton!.getAttribute("aria-pressed")).toBe("true");
      expect(host.textContent).toBe("Bobby UpdatedAlice Revised");
    } finally {
      unmount();
    }
  });
});
