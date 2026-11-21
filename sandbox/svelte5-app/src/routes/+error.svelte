<script lang="ts">
  import { page } from "$app/state";
  import Template from "#lib/components/Template.svelte";
</script>

<svelte:head><title>{page.status} · Svelte 5 Sandbox</title></svelte:head>

<Template title={`${page.status} · Route error`}>
  <div class="alert alert-warning">
    <span>{page.error?.message ?? "The requested route could not be loaded."}</span>
  </div>
  <a class="btn btn-primary" href="/">Back to overview</a>
</Template>
