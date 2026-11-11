import { $store, onMount } from "vynn";

import { Template } from "../../components/template";
import { getPokedex, name, PokeDexData } from "../../utils";

type SortKey = keyof PokeDexData["results"][number];
type SortDirection = "asc" | "desc";

export default function PokeDex() {
  const pokeDex = $store({
    isLoading: true,
    pokeDexList: [] as PokeDexData["results"],
    prevLink: "" as PokeDexData["previous"],
    nextLink: "" as PokeDexData["next"],
    sortDirection: "asc" as SortDirection,

    async fetchData(url: string | null, _controller?: AbortController) {
      if (!url) return;

      this.isLoading = true;

      const json = await getPokedex(url);

      this.pokeDexList = json.results;
      this.prevLink = json.previous?.replace(/limit=\d+/, "limit=20") ?? "";
      this.nextLink = json.next?.replace(/limit=\d+/, "limit=20") ?? "";
      this.isLoading = false;
    },
    handleSort(key: SortKey) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
      this.pokeDexList = [...this.pokeDexList].sort((a, b) => {
        const cmp = a[key].localeCompare(b[key]);
        return this.sortDirection === "asc" ? cmp : -cmp;
      });
    },
  });

  onMount(() => {
    const controller = new AbortController();

    (async () => {
      await pokeDex.fetchData(
        "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
        controller,
      );
    })();

    return () => {
      console.log("Cleaning up PokeDex component");
      controller.abort();
    };
  });

  const showUrlOnClick = (url: string) => () => alert(url);
  const sortOnClick = (key: SortKey) => () => pokeDex.handleSort(key);

  return (
    <Template title="PokeDex List">
      <div class="break-all">Hi {name.firstName}</div>
      <table class="table table-md w-full mx-auto my-2 table-fixed text-center">
        <thead>
          <tr>
            <th class="w-1/3">ID</th>
            <th onClick={sortOnClick("name")} class="select-none cursor-pointer w-1/3 text-center">
              Name
            </th>
            <th onClick={sortOnClick("url")} class="select-none cursor-pointer w-1/3 text-center">
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          {pokeDex.isLoading &&
            Array.from({ length: 20 })
              .map((_, i) => i + 1)
              .map((number) => (
                <tr>
                  <td colSpan={3} class="h-6 text-center">
                    {number === 10 ? "loading..." : <>&nbsp;</>}
                  </td>
                </tr>
              ))}
          {!pokeDex.isLoading &&
            pokeDex.pokeDexList.map(({ name, url }, index) => (
              <tr>
                <td class="w-1/3 text-center">{index + 1}</td>
                <td class="w-1/3 text-center truncate">{name}</td>
                <td class="w-1/3 text-center truncate" onClick={showUrlOnClick(url)}>
                  {url}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div class="flex gap-4 justify-center">
        <button
          class="btn"
          onClick={() => pokeDex.fetchData(pokeDex.prevLink)}
          disabled={pokeDex.isLoading || !pokeDex.prevLink}
        >
          Previous
        </button>
        <button
          class="btn"
          onClick={() => pokeDex.fetchData(pokeDex.nextLink)}
          disabled={pokeDex.isLoading || !pokeDex.nextLink}
        >
          Next
        </button>
      </div>
    </Template>
  );
}
