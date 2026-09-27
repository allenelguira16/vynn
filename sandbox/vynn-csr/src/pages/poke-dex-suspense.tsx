import {
  $computed,
  $effect,
  $state,
  isPending,
  onDestroy,
  Suspense,
} from "vynn";

import { Template } from "../components/template";
import { name, sleep } from "../utils";

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

export const PokeDexSuspense = () => {
  const url = $state("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20");
  const sortDirection = $state<SortDirection>("asc");

  const pokeDex = $computed(async () => {
    const response = await fetch(url.value);
    const json = (await response.json()) as PokeDexData;

    await sleep(1000);

    return json;
  });

  const showUrlOnClick = (url: string) => () => alert(url);
  const sortOnClick = (key: SortKey) => () => {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";

    pokeDex.value = {
      ...pokeDex.value,
      results: [...pokeDex.value.results].sort((a, b) => {
        const cmp = a[key].localeCompare(b[key]);
        return sortDirection.value === "asc" ? cmp : -cmp;
      }),
    };
  };

  const changeUrl = (newUrl: string | null) => {
    if (isPending(pokeDex) || !newUrl) return;

    url.value = newUrl.replace(/limit=\d+/, "limit=20");
  };

  onDestroy(() => {
    console.log("pokedex-suspense destroyed");
  });

  $effect(() => {
    // console.log(isPending(pokeDex));
  });

  return (
    <Template title="PokeDex List (via Suspense)">
      <div>
        <div class="break-all">Hi {name.firstName}</div>
        <table class="w-full mx-auto my-2 table-fixed">
          <thead>
            <tr>
              <th class="w-1/3">ID</th>
              <th
                onClick={sortOnClick("name")}
                class="select-none cursor-pointer w-1/3"
              >
                Name
              </th>
              <th
                onClick={sortOnClick("url")}
                class="select-none cursor-pointer w-1/3"
              >
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
                        <td colSpan={3} class="h-6 text-center">
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
                {pokeDex.value.results.map(({ name, url }, index) => (
                  <tr>
                    <td class="w-1/3 text-center">{index + 1}</td>
                    <td class="w-1/3 text-center truncate">{name}</td>
                    <td
                      class="w-1/3 text-center truncate"
                      onClick={showUrlOnClick(url)}
                    >
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
            onClick={() => {
              changeUrl(pokeDex.value?.previous);
            }}
            disabled={isPending(pokeDex) || !pokeDex.value?.previous}
          >
            Previous
          </button>
          <button
            class="btn"
            onClick={() => {
              changeUrl(pokeDex.value?.next);
            }}
            disabled={isPending(pokeDex) || !pokeDex.value?.next}
          >
            Next
          </button>
        </div>
      </div>
    </Template>
  );
};
