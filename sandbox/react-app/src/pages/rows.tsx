import { useState } from "react";

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
  const [rows, setRows] = useState<Row[]>(createRows);
  const [nextID, setNextID] = useState(INITIAL_ROW_COUNT + 1);

  const updateOne = () => {
    setRows((current) =>
      current.map((row, index) =>
        index === Math.min(499, current.length - 1) && current.length > 0
          ? { ...row, value: row.value + 1 }
          : row,
      ),
    );
  };

  const updateOneHundred = () => {
    setRows((current) =>
      current.map((row, index) =>
        index % 10 === 0 ? { ...row, value: row.value + 1 } : row,
      ),
    );
  };

  const appendOneHundred = () => {
    const appended = Array.from({ length: 100 }, (_, index) => ({
      id: nextID + index,
      value: nextID + index,
    }));
    setRows((current) => [...current, ...appended]);
    setNextID((current) => current + 100);
  };

  const removeMiddle = () => {
    setRows((current) => {
      if (current.length === 0) return current;
      const middle = Math.floor(current.length / 2);
      return current.filter((_, index) => index !== middle);
    });
  };

  const reverseRows = () => setRows((current) => [...current].reverse());

  const resetRows = () => {
    setRows(createRows());
    setNextID(INITIAL_ROW_COUNT + 1);
  };

  return (
    <Template title="1,000 Reactive Rows">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm font-medium">Rows: {rows.length.toLocaleString()}</span>
        <button className="btn btn-sm" onClick={updateOne} type="button">Update one</button>
        <button className="btn btn-sm" onClick={updateOneHundred} type="button">Update 100</button>
        <button className="btn btn-sm" onClick={appendOneHundred} type="button">Append 100</button>
        <button className="btn btn-sm" onClick={removeMiddle} type="button">Remove middle</button>
        <button className="btn btn-sm" onClick={reverseRows} type="button">Reverse</button>
        <button className="btn btn-sm btn-ghost" onClick={resetRows} type="button">Reset</button>
      </div>

      <p className="text-sm opacity-70 mb-2">
        Identical data and interactions across the framework sandboxes. Update a row,
        change multiple rows, or modify the list structure.
      </p>

      <div className="max-h-[70vh] overflow-auto rounded-box border border-base-300">
        <table className="table table-sm table-zebra">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-24">ID</th>
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
