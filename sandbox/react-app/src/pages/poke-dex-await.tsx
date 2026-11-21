import { Suspense, use, useState } from "react";
import { ErrorBoundary } from "../components/error-boundary";
import { LoadingRows } from "../components/loading-rows";
import { Template } from "../components/template";
import {
  clearPokedexResources,
  getPokedexResource,
  type PokeDexData,
} from "../utils";

type Pokemon = PokeDexData["results"][number];
type SortKey = keyof Pokemon;
type SortDirection = "asc" | "desc";

const INITIAL_URL = "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20";

function PokeDexContent() {
  const [request, setRequest] = useState(() => getPokedexResource(INITIAL_URL));
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const data = use(request);

  const rows = [...data.results].sort((left, right) => {
    const comparison = left[sortKey].localeCompare(right[sortKey]);
    return sortDirection === "asc" ? comparison : -comparison;
  });

  function sort(key: SortKey) {
    setSortKey(key);
    setSortDirection((value) => value === "asc" ? "desc" : "asc");
  }

  function changeUrl(url: string | null) {
    if (!url) return;
    setSortKey("name");
    setSortDirection("asc");
    setRequest(getPokedexResource(url));
  }

  return (
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
        {rows.map((pokemon, index) => (
          <tr key={pokemon.name}>
            <td className="w-1/3 text-center">{index + 1}</td>
            <td className="w-1/3 text-center truncate">{pokemon.name}</td>
            <td className="w-1/3 text-center truncate cursor-pointer" onClick={() => window.alert(pokemon.url)}>
              {pokemon.url}
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={3}>
            <div className="flex gap-4 justify-center">
              <button className="btn" onClick={() => changeUrl(data.previous)} disabled={!data.previous} type="button">
                Previous
              </button>
              <button className="btn" onClick={() => changeUrl(data.next)} disabled={!data.next} type="button">
                Next
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function PokeDexAwaitPage() {
  const [attempt, setAttempt] = useState(0);

  return (
    <Template title="PokeDex List (via use + Suspense)">
      <div className="break-all">React 19 Promise reading with use()</div>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>{error.message}</p>
            <button
              className="btn"
              onClick={() => {
                clearPokedexResources();
                setAttempt((value) => value + 1);
                reset();
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        )}
      >
        <Suspense
          fallback={
            <table className="table table-md w-full mx-auto my-2 table-fixed text-center">
              <tbody><LoadingRows /><tr><td colSpan={3}>Loading...</td></tr></tbody>
            </table>
          }
        >
          <PokeDexContent key={attempt} />
        </Suspense>
      </ErrorBoundary>
    </Template>
  );
}
