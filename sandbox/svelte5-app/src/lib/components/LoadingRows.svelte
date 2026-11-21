<script lang="ts">
  const rows = Array.from({ length: 20 }, (_, index) => index + 1);
</script>

{#each rows as row}
  <tr>
    <td colspan="3" class="h-6 text-center">
      {row === 10 ? "loading..." : "\u00a0"}
    </td>
  </tr>
{/each}
