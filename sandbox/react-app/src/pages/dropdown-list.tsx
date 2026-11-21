import { useState } from "react";
import { Template } from "../components/template";
import { useName } from "../context/name-context";

type SortDirection = "asc" | "desc";

export default function DropdownsPage() {
  const [showDropdown, setShowDropdown] = useState(true);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [numbers, setNumbers] = useState(() =>
    Array.from({ length: 8 }, (_, index) => index + 1),
  );

  function handleSort() {
    const nextDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirection(nextDirection);
    setNumbers((current) =>
      [...current].sort((a, b) => nextDirection === "asc" ? a - b : b - a),
    );
  }

  function handleRandomize() {
    setNumbers((current) => {
      const next = [...current];

      for (let index = next.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [next[index], next[other]] = [next[other], next[index]];
      }

      return next;
    });
  }

  function addDropdown() {
    setNumbers((current) => {
      if (current.length >= 8) return current;
      const sorted = [...current].sort((a, b) => a - b);
      return sorted.length === 0 ? [1] : [...sorted, sorted[sorted.length - 1] + 1];
    });
  }

  return (
    <Template title="Dropdown List">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 items-center">
          <span>Add Dropdown</span>
          <button className="btn" onClick={addDropdown} type="button">+</button>
          <button className="btn" onClick={() => setNumbers((current) => current.slice(0, -1))} type="button">-</button>
        </div>
        <div className="flex gap-2 items-center">
          <span>Sort</span>
          <button className="btn" onClick={handleSort} type="button">
            {sortDirection === "asc" ? "↑" : "↓"}
          </button>
          <button className="btn" onClick={handleRandomize} type="button">Randomize</button>
        </div>
        <div>
          <button
            className="btn"
            onClick={() => setShowDropdown((value) => !value)}
            type="button"
          >
            {showDropdown ? "Unmount Dropdown List" : "Mount Dropdown List"}
          </button>
        </div>
        {showDropdown && (
          <div className="flex gap-2 flex-col lg:flex-row">
            {numbers.map((number) => <Dropdown key={number} number={number} />)}
          </div>
        )}
        <div>Hi</div>
      </div>
    </Template>
  );
}

function Dropdown(props: { number: number }) {
  const { name } = useName();

  return (
    <div className="lg:w-[12.5%]">
      <details className="dropdown">
        <summary className="btn w-full">Open Dropdown {props.number}</summary>
        <ul className="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
          <li><button type="button">Item 1</button></li>
          <li><button type="button">Item 2</button></li>
        </ul>
      </details>
      <div className="break-all mt-4">Hi {name.firstName}</div>
    </div>
  );
}
