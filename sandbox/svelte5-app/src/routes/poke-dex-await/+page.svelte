<script lang="ts">
  import { untrack } from "svelte";
  import Template from "#lib/components/Template.svelte";
  import LoadingRows from "#lib/components/LoadingRows.svelte";
  import { getPokedex, type PokeDexData } from "#lib/pokedex.js";
  import { name } from "#lib/state.svelte.js";

  type SortKey = "name" | "url";
  type SortDirection = "asc" | "desc";
  type PokeDexProps = { data: { initial: PokeDexData } };

  let { data }: PokeDexProps = $props();
  let request = $state<Promise<PokeDexData>>(
    Promise.resolve(untrack(() => data.initial)),
  );
  let sortBy = $state<SortKey>("name");
  let sortDirection = $state<SortDirection>("asc");

  function sort(key: SortKey) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
    sortBy = key;
  }

  function changePage(url: string | null) {
    if (url) request = getPokedex(fetch, url);
  }

  function sortedRows(results: PokeDexData["results"]) {
    return [...results].sort((a, b) => {
      const comparison = a[sortBy].localeCompare(b[sortBy]);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }
</script>

<Template title="PokeDex List (via Await)">
  <div>
    <div class="break-all">Hi {name.firstName}</div>
    <table class="table table-md w-full mx-auto my-2 table-fixed text-center">
      <thead>
        <tr>
          <th class="w-1/3">ID</th>
          <th
            onclick={() => sort("name")}
            class="select-none cursor-pointer w-1/3 text-center"
          >
            Name
          </th>
          <th
            onclick={() => sort("url")}
            class="select-none cursor-pointer w-1/3 text-center"
          >
            URL
          </th>
        </tr>
      </thead>
      <tbody>
        {#await request}
          <LoadingRows />
          <tr>
            <td colspan="3">
              <div class="flex gap-4 justify-center">
                <button class="btn" disabled={true}>Previous</button>
                <button class="btn" disabled={true}>Next</button>
              </div>
            </td>
          </tr>
        {:then result}
          {#each sortedRows(result.results) as pokemon, index (pokemon.name)}
            <tr>
              <td class="w-1/3 text-center">{index + 1}</td>
              <td class="w-1/3 text-center truncate">{pokemon.name}</td>
              <td
                class="w-1/3 text-center truncate"
                onclick={() => alert(pokemon.url)}
              >
                {pokemon.url}
              </td>
            </tr>
          {/each}
          <tr>
            <td colspan="3">
              <div class="flex gap-4 justify-center">
                <button
                  class="btn"
                  onclick={() => changePage(result.previous)}
                  disabled={!result.previous}
                >
                  Previous
                </button>
                <button
                  class="btn"
                  onclick={() => changePage(result.next)}
                  disabled={!result.next}
                >
                  Next
                </button>
              </div>
            </td>
          </tr>
        {:catch error}
          <tr><td colspan="3">{String(error)}</td></tr>
        {/await}
      </tbody>
    </table>
  </div>
</Template>
