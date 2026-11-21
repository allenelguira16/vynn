import { useEffect, useMemo, useState } from "react";
import { Template } from "../components/template";
import { LoadingRows } from "../components/loading-rows";
import { getPokedex, type PokeDexData } from "../utils";

type Pokemon = PokeDexData["results"][number];
type SortKey = keyof Pokemon;
type SortDirection = "asc" | "desc";

const INITIAL_URL = "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20";

export default function PokeDexPage() {
  const [rows, setRows] = useState<Pokemon[]>([]);
  const [previous, setPrevious] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  async function load(url: string | null) {
    if (!url) return;

    setLoading(true);

    try {
      const data = await getPokedex(url);
      setRows(data.results);
      setPrevious(data.previous);
      setNext(data.next);
    } catch (error) {
      console.error("Failed to load PokéDex:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(INITIAL_URL);
  }, []);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const comparison = left[sortKey].localeCompare(right[sortKey]);
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [rows, sortKey, sortDirection],
  );

  function sort(key: SortKey) {
    setSortKey(key);
    setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
  }

  return (
    <Template title="PokeDex List">
      <table className="table table-md w-full mx-auto my-2 table-fixed text-center">
        <thead>
          <tr>
            <th className="w-1/3">ID</th>
            <th onClick={() => sort("name")} className="select-none cursor-pointer w-1/3 text-center">
              Name
            </th>
            <th onClick={() => sort("url")} className="select-none cursor-pointer w-1/3 text-center">
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRows />
          ) : (
            sortedRows.map((pokemon, index) => (
              <tr key={pokemon.name}>
                <td className="w-1/3 text-center">{index + 1}</td>
                <td className="w-1/3 text-center truncate">{pokemon.name}</td>
                <td className="w-1/3 text-center truncate cursor-pointer" onClick={() => window.alert(pokemon.url)}>
                  {pokemon.url}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex gap-4 justify-center">
        <button className="btn" onClick={() => void load(previous)} disabled={loading || !previous} type="button">
          Previous
        </button>
        <button className="btn" onClick={() => void load(next)} disabled={loading || !next} type="button">
          Next
        </button>
      </div>
    </Template>
  );
}
