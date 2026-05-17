import { $store, resource, Suspense } from "vynn";

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

export default function PokeDexSuspense() {
  const pokeDex = $store({
    url: "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
    sortDirection: "asc" as SortDirection,
    sort(key: SortKey) {
      if (!pokeDexResource.data) return;

      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";

      pokeDexResource.mutate({
        ...pokeDexResource.data,
        results: [...pokeDexResource.data.results].sort((a, b) => {
          const cmp = a[key].localeCompare(b[key]);
          return this.sortDirection === "asc" ? cmp : -cmp;
        }),
      });
    },
    changeUrl(newUrl: string | null) {
      if (pokeDexResource.loading || !newUrl) return;

      this.url = newUrl.replace(/limit=\d+/, "limit=20");
    },
  });

  const pokeDexResource = resource(
    async (url) => {
      "use server";

      await sleep(1000);
      const response = await fetch(url);
      const json = (await response.json()) as PokeDexData;

      return json;
    },
    [pokeDex.url],
  );

  const showUrlOnClick = (url: string) => () => alert(url);
  const sortOnClick = (key: SortKey) => () => pokeDex.sort(key);

  // console.log(pokeDexResource.data.results);
  return (
    <Template title="PokeDex List (via Suspense)">
      <div>
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
            <Suspense
              fallback={
                <>
                  {/* {loop(Array.from({ length: 20 }).map((_, i) => i + 1)).each((number) => (
                  <tr>
                    <td colSpan={3} class="h-[24px] text-center">
                      {number === 10 && "loading..."}
                    </td>
                  </tr>
                ))} */}
                  {Array.from({ length: 20 })
                    .map((_, i) => i + 1)
                    .map((number) => (
                      <tr>
                        <td colSpan={3} class="h-[24px] text-center">
                          {number === 10 && "loading..."}
                        </td>
                      </tr>
                    ))}
                </>
              }
            >
              <>
                {/* {loop(pokeDexResource.data?.results).each(({ name, url }, index) => (
                <tr>
                  <td class="w-1/3 text-center">{index.value + 1}</td>
                  <td class="w-1/3 text-center truncate">{name}</td>
                  <td class="w-1/3 text-center truncate" onClick={showUrlOnClick(url)}>
                    {url}
                  </td>
                </tr>
              ))} */}
                {pokeDexResource.data.results.map(({ name, url }, index) => (
                  <tr>
                    <td class="w-1/3 text-center">{index + 1}</td>
                    <td class="w-1/3 text-center truncate">{name}</td>
                    <td class="w-1/3 text-center truncate" onClick={showUrlOnClick(url)}>
                      {url}
                    </td>
                  </tr>
                ))}
              </>
            </Suspense>
          </tbody>
        </table>
        <div class="flex gap-4 justify-center">
          <button
            class="btn"
            onClick={() => pokeDex.changeUrl(pokeDexResource.data?.previous)}
            disabled={pokeDexResource.loading || !pokeDexResource.data?.previous}
          >
            Previous
          </button>
          <button
            class="btn"
            onClick={() => pokeDex.changeUrl(pokeDexResource.data?.next)}
            disabled={pokeDexResource.loading || !pokeDexResource.data?.next}
          >
            Next
          </button>
        </div>
      </div>
    </Template>
  );
}
