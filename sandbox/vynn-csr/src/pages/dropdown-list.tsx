import { $effect, $state, $store, onDestroy, onMount } from "vynn";

import { Template } from "../components/template";
import { name } from "../utils";
// import { $for } from "vynn/render";

type SortDirection = "asc" | "desc";

export const Dropdowns = () => {
  console.log("Dropdown rerender"); // log once
  const dropdownStore = $store({
    showDropdown: true,
    sortDirection: "asc" as SortDirection,
    numbers: Array.from({ length: 8 }, (_, i) => i + 1),

    handleSort() {
      dropdownStore.numbers = [...dropdownStore.numbers].sort((a, b) => {
        return dropdownStore.sortDirection === "desc" ? a - b : b - a;
      });
      dropdownStore.sortDirection =
        dropdownStore.sortDirection === "asc" ? "desc" : "asc";
    },
    handleRandomize() {
      const result = [...dropdownStore.numbers];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      dropdownStore.numbers = result;
    },
    addDropdown() {
      let currentNumbers = [...dropdownStore.numbers];

      if (currentNumbers.length >= 8) return;

      currentNumbers = currentNumbers.sort((a, b) => a - b);

      if (!currentNumbers.length) {
        dropdownStore.numbers = [1];
      } else {
        dropdownStore.numbers = [
          ...currentNumbers,
          currentNumbers[currentNumbers.length - 1] + 1,
        ];
      }
    },
    removeDropdown() {
      if (dropdownStore.numbers.length > 0) {
        dropdownStore.numbers = dropdownStore.numbers.slice(0, -1);
      }
    },
  });

  $effect(() => {
    // console.log(dropdownStore.numbers);
  });

  // onMount(async () => {
  //   console.log("Dropdowns onMount");
  // });

  // onDestroy(async () => {
  //   console.log("Dropdowns onDestroy");
  // });

  return (
    <Template title="Dropdown List">
      <div class="flex flex-col gap-4">
        <div>
          <div class="flex gap-2 items-center">
            <span>Add Dropdown</span>
            <button class="btn" onClick={dropdownStore.addDropdown}>
              +
            </button>
            <button class="btn" onClick={dropdownStore.removeDropdown}>
              -
            </button>
          </div>
        </div>
        <div class="flex gap-2 items-center">
          <span>Sort</span>
          <button class="btn" onClick={dropdownStore.handleSort}>
            {dropdownStore.sortDirection === "asc" ? "↑" : "↓"}
          </button>
          <button class="btn" onClick={dropdownStore.handleRandomize}>
            Randomize
          </button>
        </div>
        <div>
          <button
            class="btn"
            onClick={() =>
              (dropdownStore.showDropdown = !dropdownStore.showDropdown)
            }
          >
            Unmount Dropdown List
          </button>
        </div>
        {dropdownStore.showDropdown && (
          <DropdownList dropdowns={dropdownStore} />
        )}
        <div>Hi</div>
      </div>
    </Template>
  );
};

type TDropdownListProps = {
  dropdowns: {
    numbers: number[];
  };
};

const DropdownList = ({ dropdowns }: TDropdownListProps) => {
  console.log("DropdownList rerender"); // log twice
  // onMount(async () => {
  //   console.log("DropdownList onMount");
  // });

  // onDestroy(async () => {
  //   console.log("DropdownList onDestroy");
  // });

  // console.log("hey");

  return (
    <div class="flex gap-2 flex-col lg:flex-row">
      {/* {loop(dropdowns.numbers).each((number) => (
        <Dropdown number={number} />
      ))} */}
      {dropdowns.numbers.map((number) => (
        <Dropdown number={number} />
      ))}
      {/* {$for(
        () => dropdowns.numbers,
        (item) => (
          <Dropdown number={item} />
        ),
      )} */}
    </div>
  );
};

const Dropdown = ({ number }: { number: number }) => {
  console.log("rerender"); // log thrice
  const isOpen = $state(false);

  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };

  // onMount(async () => {
  //   console.log("Dropdown onMount");
  // });

  // onDestroy(async () => {
  //   console.log("Dropdown onDestroy");
  // });

  return (
    <>
      <div class=" lg:w-[12.5%]">
        <details class="dropdown">
          <summary class="btn w-full" onClick={handleToggle}>
            Open Dropdown {number}
          </summary>
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
    </>
  );
};
