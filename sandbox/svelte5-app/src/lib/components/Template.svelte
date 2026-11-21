<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    children,
    card = false,
  }: { title: string; children: Snippet; card?: boolean } = $props();
</script>

{#if card}
  <div class="card shadow-sm w-full">
    <div class="card-body">
      <h1 class="card-title text-xl">{title}</h1>
      {@render children()}
    </div>
  </div>
{:else}
  <div class="w-full">
    <h1 class="font-bold text-2xl mb-2">{title}</h1>
    {@render children()}
  </div>
{/if}
