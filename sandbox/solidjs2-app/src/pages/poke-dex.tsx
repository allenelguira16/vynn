import { For, Show, createStore, onSettled, untrack } from "solid-js";

import { Template } from "../components/template";
import { getPokedex, name, sleep, type PokeDexData } from "../utils";

type SortKey = keyof PokeDexData["results"][number];
type SortDirection = "asc" | "desc";

const INITIAL_URL = "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20";

export default function PokeDex() {
  const [pokeDex, setPokeDex] = createStore({
    isLoading: true,
    pokeDexList: [] as PokeDexData["results"],
    prevLink: "" as PokeDexData["previous"],
    nextLink: "" as PokeDexData["next"],
    sortDirection: "asc" as SortDirection,
  });

  async function fetchData(url: string | null) {
    if (!url || (pokeDex.isLoading && pokeDex.pokeDexList.length > 0)) {
      return;
    }

    setPokeDex((state) => {
      state.isLoading = true;
    });

    try {
      const json = await getPokedex(url);

      await sleep(0);

      setPokeDex((state) => {
        state.pokeDexList = json.results;
        state.prevLink = json.previous?.replace(/limit=\d+/, "limit=20") ?? "";
        state.nextLink = json.next?.replace(/limit=\d+/, "limit=20") ?? "";
      });
    } catch (error) {
      console.error("Failed to load PokéDex:", error);
    } finally {
      setPokeDex((state) => {
        state.isLoading = false;
      });
    }
  }

  function handleSort(key: SortKey) {
    setPokeDex((state) => {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";

      state.pokeDexList = [...state.pokeDexList].sort((a, b) => {
        const cmp = a[key].localeCompare(b[key]);

        return state.sortDirection === "asc" ? cmp : -cmp;
      });
    });
  }

  onSettled(() => {
    // console.log("hi");

    void fetchData(INITIAL_URL);

    return () => {
      console.log("Cleaning up PokeDex component");
    };
  });

  const showUrlOnClick = (url: string) => () => {
    alert(url);
  };

  const sortOnClick = (key: SortKey) => () => {
    handleSort(key);
  };

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
          <Show
            when={pokeDex.isLoading}
            fallback={
              <For each={pokeDex.pokeDexList}>
                {(pokemon, index) => (
                  <tr>
                    <td class="w-1/3 text-center">{index() + 1}</td>

                    <td class="w-1/3 text-center truncate">{pokemon.name}</td>

                    <td
                      class="w-1/3 text-center truncate"
                      onClick={showUrlOnClick(untrack(() => pokemon.url))}
                    >
                      {pokemon.url}
                    </td>
                  </tr>
                )}
              </For>
            }
          >
            <For each={Array.from({ length: 20 }, (_, i) => i + 1)}>
              {(number) => (
                <tr>
                  <td colspan={3} class="h-6 text-center">
                    {number === 10 ? "loading..." : <>&nbsp;</>}
                  </td>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>

      <div class="flex gap-4 justify-center">
        <button
          class="btn"
          onClick={() => {
            void fetchData(pokeDex.prevLink);
          }}
          disabled={pokeDex.isLoading || !pokeDex.prevLink}
        >
          Previous
        </button>

        <button
          class="btn"
          onClick={() => {
            void fetchData(pokeDex.nextLink);
          }}
          disabled={pokeDex.isLoading || !pokeDex.nextLink}
        >
          Next
        </button>
      </div>
    </Template>
  );
}
