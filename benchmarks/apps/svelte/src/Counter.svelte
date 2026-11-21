<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<main>
  <h1>Counter</h1>
  <p>Count: {count}</p>
  <p>Double: {doubled}</p>
  <button type="button" onclick={() => count++}>
    Increment
  </button>
</main>
