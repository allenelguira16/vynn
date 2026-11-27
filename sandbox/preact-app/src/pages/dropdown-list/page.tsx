import { useState } from "preact/hooks";
import { Template } from "../../components/template";
import { useName } from "../../context/name-context";

type SortDirection = "asc" | "desc";

export default function DropdownListPage() {
  const [showDropdown, setShowDropdown] = useState(true);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [numbers, setNumbers] = useState(
    Array.from({ length: 8 }, (_, index) => index + 1),
  );

  const handleSort = () => {
    setNumbers((current) =>
      [...current].sort((a, b) => (sortDirection === "desc" ? a - b : b - a)),
    );
    setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
  };

  const handleRandomize = () => {
    setNumbers((current) => {
      const result = [...current];
      for (let index = result.length - 1; index > 0; index--) {
        const next = Math.floor(Math.random() * (index + 1));
        [result[index], result[next]] = [result[next], result[index]];
      }
      return result;
    });
  };

  const addDropdown = () => {
    setNumbers((current) => {
      if (current.length >= 8) return current;
      const ordered = [...current].sort((a, b) => a - b);
      return [...ordered, (ordered.at(-1) ?? 0) + 1];
    });
  };

  const removeDropdown = () => setNumbers((current) => current.slice(0, -1));

  return (
    <Template title="Dropdown List">
      <div class="flex flex-col gap-4">
        <div class="flex gap-2 items-center">
          <span>Add Dropdown</span>
          <button class="btn" onClick={addDropdown}>+</button>
          <button class="btn" onClick={removeDropdown}>-</button>
        </div>
        <div class="flex gap-2 items-center">
          <span>Sort</span>
          <button class="btn" onClick={handleSort}>
            {sortDirection === "asc" ? "↑" : "↓"}
          </button>
          <button class="btn" onClick={handleRandomize}>Randomize</button>
        </div>
        <div>
          <button class="btn" onClick={() => setShowDropdown((value) => !value)}>
            {showDropdown ? "Unmount Dropdown List" : "Mount Dropdown List"}
          </button>
        </div>
        {showDropdown && <DropdownList numbers={numbers} />}
        <div>Hi</div>
      </div>
    </Template>
  );
}

function DropdownList(props: { numbers: number[] }) {
  return (
    <div class="flex gap-2 flex-col lg:flex-row">
      {props.numbers.map((number) => (
        <Dropdown number={number} key={number} />
      ))}
    </div>
  );
}

function Dropdown(props: { number: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { name } = useName();

  return (
    <div class="lg:w-[12.5%]">
      <details class="dropdown" open={isOpen}>
        <summary class="btn w-full" onClick={() => setIsOpen((value) => !value)}>
          Open Dropdown {props.number}
        </summary>
        <ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
          <li><a href="#item-1">Item 1</a></li>
          <li><a href="#item-2">Item 2</a></li>
        </ul>
      </details>
      <div class="break-all mt-4">Hi {name.firstName}</div>
    </div>
  );
}
