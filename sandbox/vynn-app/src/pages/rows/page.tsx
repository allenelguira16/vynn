import { $store } from "vynn";

import { Template } from "../../components/template";

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
  const rows = $store(createRows());
  let nextID = INITIAL_ROW_COUNT + 1;

  const updateOne = () => {
    if (rows.length === 0) return;
    rows[Math.min(499, rows.length - 1)].value++;
  };

  const updateOneHundred = () => {
    for (let index = 0; index < rows.length; index += 10) {
      rows[index].value++;
    }
  };

  const appendOneHundred = () => {
    rows.push(
      ...Array.from({ length: 100 }, () => {
        const id = nextID++;
        return { id, value: id };
      }),
    );
  };

  const removeMiddle = () => {
    if (rows.length === 0) return;
    rows.splice(Math.floor(rows.length / 2), 1);
  };

  const reverseRows = () => rows.reverse();

  const resetRows = () => {
    rows.splice(0, rows.length, ...createRows());
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>Hi key-{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Template>
  );
}
