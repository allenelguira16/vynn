import { Suspense, use } from "preact/compat";
import { useState } from "preact/hooks";

import { Template } from "../../components/template";
import { useName } from "../../context/name-context";
import { createResourceCache, getPokedex, type PokeDexData } from "../../utils";

type SortKey = keyof PokeDexData["results"][number];
type SortDirection = "asc" | "desc";

const getCachedPokedex = createResourceCache<PokeDexData>();

function PokeDexTable(props: {
  url: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onPage: (url: string) => void;
}) {
  const data = use(getCachedPokedex(props.url, () => getPokedex(props.url)));
  const results = [...data.results].sort((a, b) => {
    const comparison = a[props.sortKey].localeCompare(b[props.sortKey]);
    return props.sortDirection === "asc" ? comparison : -comparison;
  });

  return (
    <tbody>
      {results.map(({ name, url }, index) => (
        <Row name={name} url={url} index={index} key={name} />
      ))}
      <tr>
        <td colSpan={3}>
          <div class="flex gap-4 justify-center">
            <button
              class="btn"
              onClick={() => data.previous && props.onPage(data.previous.replace(/limit=\d+/, "limit=20"))}
              disabled={!data.previous}
            >
              Previous
            </button>
            <button
              class="btn"
              onClick={() => data.next && props.onPage(data.next.replace(/limit=\d+/, "limit=20"))}
              disabled={!data.next}
            >
              Next
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function Row(props: { name: string; url: string; index: number }) {
  return (
    <tr>
      <td class="w-1/3 text-center">{props.index + 1}</td>
      <td class="w-1/3 text-center truncate">{props.name}</td>
      <td
        class="w-1/3 text-center truncate cursor-pointer"
        onClick={() => alert(props.url)}
      >
        {props.url}
      </td>
    </tr>
  );
}

function LoadingRows() {
  return (
    <tbody>
      {Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
        <tr key={number}>
          <td colSpan={3} class="h-6 text-center">
            {number === 10 ? "loading..." : <>&nbsp;</>}
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={3}>
          <div class="flex gap-4 justify-center">
            <button class="btn" disabled>Previous</button>
            <button class="btn" disabled>Next</button>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export default function PokeDexAwaitPage() {
  const [url, setUrl] = useState(
    "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
  );
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { name } = useName();

  const sortOnClick = (key: SortKey) => {
    setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    setSortKey(key);
  };

  return (
    <Template title="PokeDex List (via Await)">
      <div class="break-all">Hi {name.firstName}</div>
      <table class="table table-md w-full mx-auto my-2 table-fixed text-center">
        <thead>
          <tr>
            <th class="w-1/3">ID</th>
            <th
              onClick={() => sortOnClick("name")}
              class="select-none cursor-pointer w-1/3 text-center"
            >
              Name
            </th>
            <th
              onClick={() => sortOnClick("url")}
              class="select-none cursor-pointer w-1/3 text-center"
            >
              URL
            </th>
          </tr>
        </thead>
        <Suspense fallback={<LoadingRows />}>
          <PokeDexTable
            key={url}
            url={url}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onPage={setUrl}
          />
        </Suspense>
      </table>
    </Template>
  );
}
