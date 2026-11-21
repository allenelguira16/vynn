<script lang="ts">
  import { untrack } from "svelte";
  import Template from "#lib/components/Template.svelte";
  import PokeDexTable from "#lib/components/PokeDexTable.svelte";
  import { getPokedex, type PokeDexData } from "#lib/pokedex.js";
  import { name } from "#lib/state.svelte.js";

  type SortKey = "name" | "url";
  type SortDirection = "asc" | "desc";
  type PokeDexProps = { data: { initial: PokeDexData } };

  let { data }: PokeDexProps = $props();
  let current = $state(untrack(() => data.initial));
  let loading = $state(false);
  let sortKey = $state<SortKey>("name");
  let sortDirection = $state<SortDirection>("asc");

  let sortedRows = $derived(
    [...current.results].sort((a, b) => {
      const comparison = a[sortKey].localeCompare(b[sortKey]);
      return sortDirection === "asc" ? comparison : -comparison;
    }),
  );

  function sort(key: SortKey) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
    sortKey = key;
  }

  async function changePage(url: string | null) {
    if (!url || loading) return;
    loading = true;

    try {
      current = await getPokedex(fetch, url);
    } finally {
      loading = false;
    }
  }
</script>

<Template title="PokeDex List">
  <div class="break-all">Hi {name.firstName}</div>
  <PokeDexTable
    rows={sortedRows}
    {sortKey}
    {sortDirection}
    onsort={sort}
    {loading}
  />
  <div class="flex gap-4 justify-center">
    <button
      class="btn"
      onclick={() => changePage(current.previous)}
      disabled={loading || !current.previous}
    >
      Previous
    </button>
    <button
      class="btn"
      onclick={() => changePage(current.next)}
      disabled={loading || !current.next}
    >
      Next
    </button>
  </div>
</Template>
