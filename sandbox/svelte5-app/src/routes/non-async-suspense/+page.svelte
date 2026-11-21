<script lang="ts">
  import Template from "#lib/components/Template.svelte";

  const children = Promise.resolve("Children");
</script>

<Template title="Non-Async Suspense">
  <div>
    {#await children}
      <div>hi</div>
    {:then value}
      <div>{value}</div>
    {/await}
  </div>
</Template>
