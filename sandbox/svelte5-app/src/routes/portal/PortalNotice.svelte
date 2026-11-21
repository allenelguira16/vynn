<script lang="ts">
  import Template from "#lib/components/Template.svelte";
  import { name } from "#lib/state.svelte.js";

  function portal(node: HTMLElement) {
    const target = document.querySelector<HTMLElement>("#portal-target");
    target?.append(node);

    return {
      destroy() {
        node.remove();
      },
    };
  }
</script>

<div use:portal>
  <Template title="Portal">{name.firstName}</Template>
</div>
