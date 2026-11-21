<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { NAME_CONTEXT, type NameState } from "#lib/context.js";

  const forms = getContext<NameState>(NAME_CONTEXT);
  let count = $state(0);

  onMount(() => {
    const cleanup = setInterval(() => {
      count++;
    }, 1000);

    return () => clearInterval(cleanup);
  });

  const nameEl = () => `Name: ${forms.name} Hi`;
</script>

<div>Name: {forms.name}</div>
{nameEl()}
<input
  type="text"
  name="name"
  class="input"
  oninput={(event) => (forms.name = event.currentTarget.value)}
  placeholder="name"
  autocomplete="off"
  value={forms.name}
/>
{" "}
{count}
