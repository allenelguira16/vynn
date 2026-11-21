<script lang="ts">
  import Template from "#lib/components/Template.svelte";

  const sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

  const msg3 = sleep(3000).then(() => "hello world 3");
  let msg2 = $state("hello world 2");
  const msg = sleep(1000).then(() => "hello world");
</script>

<Template title="Stacked Suspense">
  <input class="input w-full" bind:value={msg2} />
  {#await msg3}
    Ngee
  {:then value}
    {value}
  {/await}
  {#await msg}
    <div>loading 1...</div>
  {:then value}
    <div>hi</div>
    <div>{value}</div>
    {#await sleep(2000).then(() => msg2)}
      <div>loading 2...</div>
    {:then value2}
      {value2}
    {/await}
  {/await}
</Template>
