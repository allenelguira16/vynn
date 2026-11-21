<script lang="ts">
  import Template from "#lib/components/Template.svelte";
  import ErrorCase from "./ErrorCase.svelte";
</script>

<Template title="Error Boundary">
  <div class="flex gap-4">
    <ErrorCase title="ComponentWillThrow" />
    <ErrorCase title="ComponentWillThrowAfterAsync" />
    <ErrorCase title="ComponentWillThrowAfterCount" />
  </div>
</Template>
