<script lang="ts">
  let { explode }: { explode: boolean } = $props();

  const message = $derived.by(() => {
    if (explode) throw new Error("The demo component intentionally failed during rendering.");
    return "The component rendered successfully.";
  });
</script>

<p>{message}</p>
