<script lang="ts">
  import { onMount, type Component } from "svelte";
  import Template from "#lib/components/Template.svelte";

  let LazyImport: Component | null = $state(null);
  let LazyTest: Component | null = $state(null);

  onMount(async () => {
    const [lazyImport, lazyTest] = await Promise.all([
      import("./LazyPanel.svelte"),
      import("./TestPanel.svelte"),
    ]);

    LazyImport = lazyImport.default;
    LazyTest = lazyTest.default;
  });
</script>

<Template title="Lazy">
  <div>
    {#if LazyImport}
      <h4>Test</h4>
      <LazyImport />
    {:else}
      Tester
    {/if}
    {#if LazyTest}
      <LazyTest />
    {:else}
      Tester2
    {/if}
    <h5>Test</h5>
  </div>
</Template>
