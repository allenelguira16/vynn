<script lang="ts">
  import Template from "#lib/components/Template.svelte";
  import BrokenDemo from "./BrokenDemo.svelte";

  let { title }: { title: string } = $props();
  let showError = $state(false);
</script>

<Template title={title} card>
  {#if showError}
    <svelte:boundary>
      <BrokenDemo explode={true} />
      {#snippet failed(error)}
        <div>
          <p>{String(error)}</p>
          <button class="btn" onclick={() => (showError = false)}>
            Try Again
          </button>
        </div>
      {/snippet}
    </svelte:boundary>
  {:else}
    <p>Component rendered successfully.</p>
    <button class="btn" onclick={() => (showError = true)}>Trigger Error</button>
  {/if}
</Template>
