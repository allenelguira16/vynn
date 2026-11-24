<script>
  let count = $state(0);
</script>

<main>
  <h1>Counter</h1>
  <p>Count: {count}</p>
  <button type="button" onclick={() => count++}>
    Increment
  </button>
</main>
