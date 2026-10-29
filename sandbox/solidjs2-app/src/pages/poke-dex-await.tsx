import {
  createMemo,
  createSignal,
  For,
  isPending,
  Loading,
  onCleanup,
  onSettled,
  Show,
} from "solid-js";

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

export default function PokeDexAwait() {
  const [url, setUrl] = createSignal(
    "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
  );

  const [sortBy, setSortBy] = createSignal<SortKey>("name");
  const [sortDirection, setSortDirection] = createSignal<SortDirection>("asc");
  const [sortApplied, setSortApplied] = createSignal(false);

  const pokeDex = createMemo(async () => {
    const response = await fetch(url());
    const json = (await response.json()) as PokeDexData;

    await sleep(0);

    return json;
  });

  const sortedPokeDex = createMemo(() => {
    const data = pokeDex();

    if (!sortApplied()) {
      return data;
    }

    const key = sortBy();
    const direction = sortDirection();

    return {
      ...data,
      results: [...data.results].sort((a, b) => {
        const cmp = a[key].localeCompare(b[key]);

        return direction === "asc" ? cmp : -cmp;
      }),
    };
  });

  const sortOnClick = (key: SortKey) => () => {
    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));

    setSortBy(key);
    setSortApplied(true);
  };

  const changeUrl = (newUrl: string | null) => {
    if (isPending(pokeDex) || !newUrl) {
      return;
    }

    // A new API page starts with the API's original ordering.
    setSortApplied(false);
    setUrl(newUrl.replace(/limit=\d+/, "limit=20"));
  };

  let el!: HTMLDivElement;

  onSettled(() => {
    // console.log("pokedex-await mounted");
    console.log(el);
  });

  onCleanup(() => {
    console.log("pokedex-await destroyed");
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

              <th
                onClick={sortOnClick("url")}
                class="select-none cursor-pointer w-1/3 text-center"
              >
                URL
              </th>
            </tr>
          </thead>

          <tbody>
            <Loading fallback={<LoadingRows />}>
              <Show
                when={isPending(pokeDex)}
                fallback={
                  <>
                    <For each={sortedPokeDex().results}>
                      {(pokemon, index) => (
                        <Row
                          name={pokemon.name}
                          url={pokemon.url}
                          index={index()}
                        />
                      )}
                    </For>

                    <tr>
                      <td colspan={3}>
                        <div class="flex gap-4 justify-center">
                          <button
                            class="btn"
                            onClick={() => {
                              changeUrl(sortedPokeDex().previous);
                            }}
                            disabled={
                              isPending(pokeDex) || !sortedPokeDex().previous
                            }
                          >
                            Previous
                          </button>

                          <button
                            class="btn"
                            onClick={() => {
                              changeUrl(sortedPokeDex().next);
                            }}
                            disabled={
                              isPending(pokeDex) || !sortedPokeDex().next
                            }
                          >
                            Next
                          </button>
                        </div>
                      </td>
                    </tr>
                  </>
                }
              >
                <LoadingRows />
              </Show>
            </Loading>
          </tbody>
        </table>
      </div>
    </Template>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
        <tr>
          <td colspan={3} class="h-6 text-center">
            {number === 10 ? "loading..." : <>&nbsp;</>}
          </td>
        </tr>
      ))}

      <tr>
        <td colspan={3}>
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
  );
}

function Row(props: { name: string; url: string; index: number }) {
  const showUrlOnClick = (url: string) => () => {
    alert(url);
  };

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
