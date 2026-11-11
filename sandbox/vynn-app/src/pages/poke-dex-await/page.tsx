import { $effect, $state, $store, Await, isPending, onDestroy, onMount } from "vynn";

import { Template } from "../../components/template";
import { getPokedex, name, PokeDexData } from "../../utils";

type SortKey = keyof PokeDexData["results"][number];
type SortDirection = "asc" | "desc";

export default function PokeDexAwait() {
  const url = $state("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20");
  const sortBy = $state<SortKey>("name");
  const sortDirection = $state<SortDirection>("asc");

  const pokeDex = $store(async () => {
    return getPokedex(url.value);
  });

  const sortOnClick = (key: SortKey) => () => {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    sortBy.value = key;

    pokeDex.results = [...pokeDex.results].sort((a, b) => {
      const cmp = a[sortBy.value].localeCompare(b[sortBy.value]);
      return sortDirection.value === "asc" ? cmp : -cmp;
    });
  };

  const changeUrl = (newUrl: string | null) => {
    if (isPending(pokeDex) || !newUrl) return;

    url.value = newUrl.replace(/limit=\d+/, "limit=20");
  };

  onMount(() => {
    // console.log("pokedex-await mounted");
  });

  onDestroy(() => {
    console.log("pokedex-await destroyed");
  });

  $effect(() => {
    // console.log("rerender");
    // console.log(pokeDex.value);
  });

  let el!: HTMLDivElement;

  onMount(() => {
    console.log(el);
  });

  return (
    <Template title="PokeDex List (via Await)">
      <div ref={el}>
        <div class="break-all">Hi {name.firstName}</div>
        <table class="table table-md w-full mx-auto my-2 table-fixed text-center">
          <thead>
            <tr>
              <th class="w-1/3">ID</th>
              <th
                onClick={sortOnClick("name")}
                class="select-none cursor-pointer w-1/3 text-center"
              >
                Name
              </th>
              <th onClick={sortOnClick("url")} class="select-none cursor-pointer w-1/3 text-center">
                URL
              </th>
            </tr>
          </thead>
          <tbody>
            <Await
              fallback={
                <>
                  {Array.from({ length: 20 })
                    .map((_, i) => i + 1)
                    .map((number) => (
                      <tr>
                        <td colSpan={3} class="h-6 text-center">
                          {number === 10 ? "loading..." : <>&nbsp;</>}
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td colSpan={3}>
                      <div class="flex gap-4 justify-center">
                        <button class="btn" disabled={true}>
                          Previous
                        </button>
                        <button class="btn" disabled={true}>
                          Next
                        </button>
                      </div>
                    </td>
                  </tr>
                </>
              }
            >
              <>
                {pokeDex.results.map(({ name, url }, index) => (
                  <Row name={name} url={url} index={index} />
                ))}
                <tr>
                  <td colSpan={3}>
                    <div class="flex gap-4 justify-center">
                      <button
                        class="btn"
                        onClick={() => {
                          changeUrl(pokeDex.previous);
                        }}
                        disabled={isPending(pokeDex) || !pokeDex.previous}
                      >
                        Previous
                      </button>
                      <button
                        class="btn"
                        onClick={() => {
                          changeUrl(pokeDex.next);
                        }}
                        disabled={isPending(pokeDex) || !pokeDex.next}
                      >
                        Next
                      </button>
                    </div>
                  </td>
                </tr>
              </>
            </Await>
          </tbody>
        </table>
      </div>
    </Template>
  );
}

function Row(props: { name: string; url: string; index: number }) {
  const showUrlOnClick = (url: string) => () => alert(url);

  return (
    <tr>
      <td class="w-1/3 text-center">{props.index + 1}</td>
      <td class="w-1/3 text-center truncate">{props.name}</td>
      <td class="w-1/3 text-center truncate" onClick={showUrlOnClick(props.url)}>
        {props.url}
      </td>
    </tr>
  );
}
