import { For, createStore } from "solid-js";

import { Template } from "../components/template";

type Row = {
  id: number;
  value: number;
};

const INITIAL_ROW_COUNT = 1000;

function createRows(): Row[] {
  return Array.from({ length: INITIAL_ROW_COUNT }, (_, index) => ({
    id: index + 1,
    value: index + 1,
  }));
}

export default function RowsPage() {
  const [rows, setRows] = createStore<Row[]>(createRows());
  let nextID = INITIAL_ROW_COUNT + 1;

  const updateOne = () => {
    setRows((state) => {
      if (state.length === 0) return;
      const index = Math.min(499, state.length - 1);
      state[index].value += 1;
    });
  };

  const updateOneHundred = () => {
    setRows((state) => {
      for (let index = 0; index < state.length; index += 10) {
        state[index].value += 1;
      }
    });
  };

  const appendOneHundred = () => {
    const appended = Array.from({ length: 100 }, () => {
      const id = nextID++;
      return { id, value: id };
    });
    setRows((state) => {
      state.push(...appended);
    });
  };

  const removeMiddle = () => {
    setRows((state) => {
      if (state.length === 0) return;
      const middle = Math.floor(state.length / 2);
      state.splice(middle, 1);
    });
  };

  const reverseRows = () => {
    setRows((state) => {
      state.reverse();
    });
  };

  const resetRows = () => {
    setRows(() => createRows());
    nextID = INITIAL_ROW_COUNT + 1;
  };

  return (
    <Template title="1,000 Reactive Rows">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <span class="text-sm font-medium">Rows: {rows.length.toLocaleString()}</span>
        <button class="btn btn-sm" onClick={updateOne}>Update one</button>
        <button class="btn btn-sm" onClick={updateOneHundred}>Update 100</button>
        <button class="btn btn-sm" onClick={appendOneHundred}>Append 100</button>
        <button class="btn btn-sm" onClick={removeMiddle}>Remove middle</button>
        <button class="btn btn-sm" onClick={reverseRows}>Reverse</button>
        <button class="btn btn-sm btn-ghost" onClick={resetRows}>Reset</button>
      </div>

      <p class="text-sm opacity-70 mb-2">
        Identical data and interactions across the framework sandboxes. Update a row,
        change multiple rows, or modify the list structure.
      </p>

      <div class="max-h-[70vh] overflow-auto rounded-box border border-base-300">
        <table class="table table-sm table-zebra">
          <thead class="sticky top-0 z-10">
            <tr>
              <th class="w-24">ID</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows}>
              {(row) => (
                <tr>
                  <td>{row.id}</td>
                  <td>Hi key-{row.value}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Template>
  );
}
