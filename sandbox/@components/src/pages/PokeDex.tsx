import { $store, loop, onMount } from "vynn";

import { Template } from "~/components/Template";
import { name, sleep } from "~/utils";

type PokeDexData = {
  count: number;
  next: string | null;
  previous: string | null;
  results: {
    name: string;
    url: string;
  }[];
};

type SortKey = keyof PokeDexData["results"][number];
type SortDirection = "asc" | "desc";

export const PokeDex = () => {
  const pokeDex = $store({
    isLoading: true,
    pokeDexList: [] as PokeDexData["results"],
    prevLink: "" as PokeDexData["previous"],
    nextLink: "" as PokeDexData["next"],
    sortDirection: "asc" as SortDirection,

    async fetchData(url: string | null, controller?: AbortController) {
      if (!url) return;

      this.isLoading = true;

      const response = await fetch(url, { signal: controller?.signal });
      const json = (await response.json()) as PokeDexData;

      await sleep(0);

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

  onMount(async () => {
    const controller = new AbortController();

    await pokeDex.fetchData("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20", controller);
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
      <table class="w-full mx-auto my-2 table-fixed">
        <thead>
          <tr>
            <th class="w-1/3">ID</th>
            <th onClick={sortOnClick("name")} class="select-none cursor-pointer w-1/3">
              Name
            </th>
            <th onClick={sortOnClick("url")} class="select-none cursor-pointer w-1/3">
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          {pokeDex.isLoading && (
            <>
              {loop(Array.from({ length: 20 }).map((_, i) => i + 1)).each((number) => (
                <tr>
                  <td colSpan={3} class="h-[24px] text-center">
                    {number === 10 && "loading..."}
                  </td>
                </tr>
              ))}
              {/* {Array.from({ length: 20 })
                .map((_, i) => i + 1)
                .map((number) => (
                  <tr>
                    <td colSpan={3} class="h-[24px] text-center">
                      {number === 10 && "loading..."}
                    </td>
                  </tr>
                ))} */}
            </>
          )}
          {!pokeDex.isLoading && (
            <>
              {loop(pokeDex.pokeDexList).each(({ name, url }, index) => (
                <tr>
                  <td class="w-1/3 text-center">{index.value + 1}</td>
                  <td class="w-1/3 text-center truncate">{name}</td>
                  <td class="w-1/3 text-center truncate" onClick={showUrlOnClick(url)}>
                    {url}
                  </td>
                </tr>
              ))}
              {/* {pokeDex.pokeDexList.map(({ name, url }, index) => (
                <tr>
                  <td class="w-1/3 text-center">{index + 1}</td>
                  <td class="w-1/3 text-center truncate">{name}</td>
                  <td class="w-1/3 text-center truncate" onClick={showUrlOnClick(url)}>
                    {url}
                  </td>
                </tr>
              ))} */}
            </>
          )}
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
};
