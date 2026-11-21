<script lang="ts">
  import Lazy from "./lazy/+page.svelte";
  import Forms from "./forms/+page.svelte";
  import Contexts from "./contexts/+page.svelte";
  import Dropdowns from "./dropdown-list/+page.svelte";
  import ComponentError from "./component-error/+page.svelte";
  import NonAsyncSuspense from "./non-async-suspense/+page.svelte";
  import PokeDex from "./poke-dex/+page.svelte";
  import PokeDexAwait from "./poke-dex-await/+page.svelte";
  import StackedSuspense from "./stacked-suspense/+page.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<Lazy />
<Forms />
<Contexts />
<Dropdowns />
<ComponentError />
<NonAsyncSuspense />
<PokeDex data={{ initial: data.initial }} />
<PokeDexAwait data={{ initial: data.initial }} />
<StackedSuspense />
