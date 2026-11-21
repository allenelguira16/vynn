<script lang="ts">
  import LoadingRows from "./LoadingRows.svelte";
  import type { PokemonEntry } from "#lib/pokedex.js";

  type SortKey = "name" | "url";
  type SortDirection = "asc" | "desc";

  let {
    rows,
    sortKey,
    sortDirection,
    onsort,
    loading = false,
  }: {
    rows: PokemonEntry[];
    sortKey: SortKey;
    sortDirection: SortDirection;
    onsort: (key: SortKey) => void;
    loading?: boolean;
  } = $props();
</script>

<table class="table table-md w-full mx-auto my-2 table-fixed text-center">
  <thead>
    <tr>
      <th class="w-1/3">ID</th>
      <th
        onclick={() => onsort("name")}
        class="select-none cursor-pointer w-1/3 text-center"
      >
        Name
      </th>
      <th
        onclick={() => onsort("url")}
        class="select-none cursor-pointer w-1/3 text-center"
      >
        URL
      </th>
    </tr>
  </thead>
  <tbody>
    {#if loading}
      <LoadingRows />
    {:else}
      {#each rows as pokemon, index (pokemon.name)}
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
    {/if}
  </tbody>
</table>
