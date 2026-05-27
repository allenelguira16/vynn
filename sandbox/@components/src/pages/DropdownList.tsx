import { $effect, $state, $store } from "vynn";

import { Template } from "~/components/Template";
import { name } from "~/utils";

type SortDirection = "asc" | "desc";

export const Dropdowns = () => {
  console.log("Dropdown rerender");
  const dropdownStore = $store({
    showDropdown: false,
    sortDirection: "asc" as SortDirection,
    numbers: [1, 2, 3, 4, 5, 6, 7, 8],

    handleSort() {
      this.numbers = [...this.numbers].sort((a, b) => {
        return this.sortDirection === "desc" ? a - b : b - a;
      });
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    },
    handleRandomize() {
      const result = [...this.numbers];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      this.numbers = result;
    },
    addDropdown() {
      let currentNumbers = [...this.numbers];

      if (currentNumbers.length >= 8) return;

      currentNumbers = currentNumbers.sort((a, b) => a - b);

      if (!currentNumbers.length) {
        this.numbers = [1];
      } else {
        this.numbers = [...currentNumbers, currentNumbers[currentNumbers.length - 1] + 1];
      }
    },
    removeDropdown() {
      if (this.numbers.length > 0) {
        this.numbers = this.numbers.slice(0, -1);
      }
    },
  });

  $effect(() => {
    console.log(dropdownStore.numbers);
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
          <button onClick={() => (dropdownStore.showDropdown = !dropdownStore.showDropdown)}>
            Unmount Dropdown List
          </button>
        </div>
        {dropdownStore.showDropdown && <DropdownList dropdowns={dropdownStore} />}
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
  console.log("weh");
  // onMount(async () => {
  //   console.log("DropdownList onMount");
  // });

  // onDestroy(async () => {
  //   console.log("DropdownList onDestroy");
  // });

  return (
    <div class="flex gap-2 flex-col lg:flex-row">
      {/* {loop(dropdowns.numbers).each((number) => (
        <Dropdown number={number} />
      ))} */}
      {dropdowns.numbers.map((number) => (
        <Dropdown number={number} key={number} />
      ))}
    </div>
  );
};

const Dropdown = ({ number }: { number: number }) => {
  console.log("rerender");
  const isOpen = $state(false);

  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };

  return (
    <>
      <div class="relative lg:w-[calc(100%/8)]">
        <div>
          <button class="btn w-full" onClick={handleToggle}>
            Open Dropdown {number}
          </button>
          <div class="break-all">Hi {name.firstName}</div>
        </div>
        {isOpen.value && (
          <div class="absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10">
            <ul>
              {Array.from({ length: 3 })
                .map((_, i) => i + 1)
                .map((item) => (
                  <li class="cursor-pointer p-2 rounded hover:bg-gray-100">Dropdown {item}</li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
};
