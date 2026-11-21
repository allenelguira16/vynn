<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Template from "#lib/components/Template.svelte";

  const pageId = $derived(Number(page.params.id) || 0);
  const searchId = $derived(Number(page.url.searchParams.get("id")) || 0);

  function update(step: number) {
    void goto(`/params/${pageId + step}?id=${searchId + step}`);
  }
</script>

<svelte:head><title>Route params · Svelte 5 Sandbox</title></svelte:head>

<Template title="Route parameters and search params">
  <p>Page ID: <strong>{pageId}</strong></p>
  <p>Search ID: <strong>{searchId}</strong></p>
  <div class="flex gap-2">
    <button class="btn" onclick={() => update(-1)}>Decrement</button>
    <button class="btn btn-primary" onclick={() => update(1)}>Increment</button>
  </div>
</Template>
