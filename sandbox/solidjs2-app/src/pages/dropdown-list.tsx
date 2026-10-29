import { createStore, For, Show } from "solid-js";

import { Template } from "../components/template";
import { name } from "../utils";

type SortDirection = "asc" | "desc";

type DropdownStore = {
  showDropdown: boolean;
  sortDirection: SortDirection;
  numbers: number[];
};

export default function Dropdowns() {
  console.log("Dropdown rerender"); // Runs once per component instance.

  const [dropdownStore, setDropdownStore] = createStore<DropdownStore>({
    showDropdown: true,
    sortDirection: "asc",
    numbers: Array.from({ length: 8 }, (_, i) => i + 1),
  });

  function handleSort() {
    const nextDirection: SortDirection =
      dropdownStore.sortDirection === "asc" ? "desc" : "asc";

    setDropdownStore((state) => {
      state.numbers = [...state.numbers].sort((a, b) =>
        nextDirection === "asc" ? a - b : b - a,
      );

      state.sortDirection = nextDirection;
    });
  }

  function handleRandomize() {
    setDropdownStore((state) => {
      const numbers = [...state.numbers];

      for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
      }

      state.numbers = numbers;
    });
  }

  function addDropdown() {
    setDropdownStore((state) => {
      if (state.numbers.length >= 8) return;

      const numbers = [...state.numbers].sort((a, b) => a - b);

      state.numbers =
        numbers.length === 0
          ? [1]
          : [...numbers, numbers[numbers.length - 1] + 1];
    });
  }

  function removeDropdown() {
    setDropdownStore((state) => {
      if (state.numbers.length > 0) {
        state.numbers = state.numbers.slice(0, -1);
      }
    });
  }

  function toggleDropdownList() {
    setDropdownStore((state) => {
      state.showDropdown = !state.showDropdown;
    });
  }

  return (
    <Template title="Dropdown List">
      <div class="flex flex-col gap-4">
        <div>
          <div class="flex gap-2 items-center">
            <span>Add Dropdown</span>

            <button class="btn" onClick={addDropdown}>
              +
            </button>

            <button class="btn" onClick={removeDropdown}>
              -
            </button>
          </div>
        </div>

        <div class="flex gap-2 items-center">
          <span>Sort</span>

          <button class="btn" onClick={handleSort}>
            {dropdownStore.sortDirection === "asc" ? "↑" : "↓"}
          </button>

          <button class="btn" onClick={handleRandomize}>
            Randomize
          </button>
        </div>

        <div>
          <button class="btn" onClick={toggleDropdownList}>
            Unmount Dropdown List
          </button>
        </div>

        <Show when={dropdownStore.showDropdown}>
          <DropdownList dropdowns={dropdownStore} />
        </Show>

        <div>Hi</div>
      </div>
    </Template>
  );
}

type TDropdownListProps = {
  dropdowns: {
    numbers: number[];
  };
};

const DropdownList = (props: TDropdownListProps) => {
  console.log("DropdownList rerender");

  return (
    <div class="flex gap-2 flex-col lg:flex-row">
      <For each={props.dropdowns.numbers}>
        {(number) => <Dropdown number={number} />}
      </For>
    </div>
  );
};

const Dropdown = (props: { number: number }) => {
  console.log("rerender");

  return (
    <div class="lg:w-[12.5%]">
      <details class="dropdown">
        <summary class="btn w-full">Open Dropdown {props.number}</summary>

        <ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
          <li>
            <a>Item 1</a>
          </li>

          <li>
            <a>Item 2</a>
          </li>
        </ul>
      </details>

      <div class="break-all mt-4">Hi {name.firstName}</div>
    </div>
  );
};
