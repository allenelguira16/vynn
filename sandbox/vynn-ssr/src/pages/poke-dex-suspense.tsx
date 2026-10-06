import {
  $async,
  $effect,
  $state,
  isPending,
  onDestroy,
  onMount,
  Suspense,
} from "vynn";

import { Template } from "../components/template";
import { name, sleep } from "../utils";
// import { $for } from "vynn/render";

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
  const sortBy = $state<SortKey>("name");
  const sortDirection = $state<SortDirection>("asc");
  const style = { "aria-label": "Hi", test: "123", name: name.firstName };

  const pokeDex = $async(async () => {
    const response = await fetch(url.value);
    const json = (await response.json()) as PokeDexData;

    await sleep(1000);

    return json;
  });

  const sortOnClick = (key: SortKey) => () => {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    sortBy.value = key;

    pokeDex.value = {
      ...pokeDex.value,
      results: [...pokeDex.value.results].sort((a, b) => {
        const cmp = a[sortBy.value].localeCompare(b[sortBy.value]);
        return sortDirection.value === "asc" ? cmp : -cmp;
      }),
    };
  };

  const changeUrl = (newUrl: string | null) => {
    if (isPending(pokeDex) || !newUrl) return;

    url.value = newUrl.replace(/limit=\d+/, "limit=20");
  };

  onMount(() => {
    // console.log("pokedex-suspense mounted");
  });

  onDestroy(() => {
    console.log("pokedex-suspense destroyed");
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
    <Template title="PokeDex List (via Suspense)">
      <div ref={el}>
        <div class="break-all" {...style}>
          Hi {name.firstName}
        </div>
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
                {/* {$for(
                  () => pokeDex.value.results,
                  ({ name, url }, index) =>
                    Row({
                      get name() {
                        return name;
                      },
                      get url() {
                        return url;
                      },
                      get index() {
                        return index.value;
                      },
                    }),
                )} */}
                {pokeDex.value.results.map(({ name, url }, index) => (
                  <Row name={name} url={url} index={index} />
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

function Row(props: { name: string; url: string; index: number }) {
  const showUrlOnClick = (url: string) => () => alert(url);

  // $effect(() => {
  //   // console.log(props.index);
  // });

  // onMount(() => {
  //   // console.log(url);
  //   console.log(`rerun`);
  // });

  // const data = $async(async () => {
  //   const res = await fetch(props.url);
  //   const json = await res.json();

  //   return json;
  // });

  // // $effect(() => {
  // //   console.log(data.value);
  // // });

  return (
    <tr>
      <td class="w-1/3 text-center">{props.index + 1}</td>
      <td class="w-1/3 text-center truncate">{props.name}</td>
      <td
        class="w-1/3 text-center truncate"
        onClick={showUrlOnClick(props.url)}
      >
        {props.url}
      </td>
    </tr>
  );
}
