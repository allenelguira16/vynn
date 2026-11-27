import { useEffect, useState } from "preact/hooks";

import { Template } from "../../components/template";
import { useName } from "../../context/name-context";
import { getPokedex, type PokeDexData } from "../../utils";

type SortKey = keyof PokeDexData["results"][number];
type SortDirection = "asc" | "desc";

const initialUrl = "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20";

export default function PokeDexPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [pokeDexList, setPokeDexList] = useState<PokeDexData["results"]>([]);
  const [prevLink, setPrevLink] = useState<string | null>(null);
  const [nextLink, setNextLink] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [url, setUrl] = useState(initialUrl);
  const { name } = useName();

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    getPokedex(url, controller.signal)
      .then((json) => {
        setPokeDexList(json.results);
        setPrevLink(json.previous?.replace(/limit=\d+/, "limit=20") ?? null);
        setNextLink(json.next?.replace(/limit=\d+/, "limit=20") ?? null);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("PokeDex request failed:", error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [url]);

  const handleSort = (key: SortKey) => {
    const nextDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirection(nextDirection);
    setPokeDexList((current) =>
      [...current].sort((a, b) => {
        const comparison = a[key].localeCompare(b[key]);
        return nextDirection === "asc" ? comparison : -comparison;
      }),
    );
  };

  const changeUrl = (next: string | null) => {
    if (!isLoading && next) setUrl(next.replace(/limit=\d+/, "limit=20"));
  };

  return (
    <Template title="PokeDex List">
      <div class="break-all">Hi {name.firstName}</div>
      <table class="table table-md w-full mx-auto my-2 table-fixed text-center">
        <thead>
          <tr>
            <th class="w-1/3">ID</th>
            <th
              onClick={() => handleSort("name")}
              class="select-none cursor-pointer w-1/3 text-center"
            >
              Name
            </th>
            <th
              onClick={() => handleSort("url")}
              class="select-none cursor-pointer w-1/3 text-center"
            >
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
                <tr key={number}>
                  <td colSpan={3} class="h-6 text-center">
                    {number === 10 ? "loading..." : <>&nbsp;</>}
                  </td>
                </tr>
              ))
            : pokeDexList.map((item, index) => (
                <tr key={item.name}>
                  <td class="w-1/3 text-center">{index + 1}</td>
                  <td class="w-1/3 text-center truncate">{item.name}</td>
                  <td
                    class="w-1/3 text-center truncate cursor-pointer"
                    onClick={() => alert(item.url)}
                  >
                    {item.url}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
      <div class="flex gap-4 justify-center">
        <button class="btn" onClick={() => changeUrl(prevLink)} disabled={isLoading || !prevLink}>
          Previous
        </button>
        <button class="btn" onClick={() => changeUrl(nextLink)} disabled={isLoading || !nextLink}>
          Next
        </button>
      </div>
    </Template>
  );
}
