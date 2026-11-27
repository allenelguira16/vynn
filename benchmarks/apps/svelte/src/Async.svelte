<script>
  let userId = $state(1);
  let user = $derived(
    Promise.resolve().then(() => {
      const id = userId;
      return { id, name: `User ${id}` };
    })
  );
</script>

<main>
  <h1>Async memo</h1>
  <button type="button" onclick={() => userId++}>
    Next user
  </button>
  {#await user}
    <p>Loading...</p>
  {:then value}
    <p>{value.name}</p>
  {/await}
</main>
