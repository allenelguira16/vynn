<script lang="ts">
  import { setContext, untrack, type Snippet } from "svelte";
  import { NAME_CONTEXT, type NameState } from "#lib/context.js";

  let { initial, children }: { initial: string; children: Snippet } = $props();

  // The provider owns its own state, initialized from the value at creation.
  const state = $state<NameState>({ name: untrack(() => initial) });
  setContext(NAME_CONTEXT, state);
</script>

{@render children()}
