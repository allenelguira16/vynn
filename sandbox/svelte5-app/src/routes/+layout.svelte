<script lang="ts">
  import "../main.css";
  import { page } from "$app/state";
  import type { Snippet } from "svelte";
  import PortalNotice from "./portal/PortalNotice.svelte";

  let { children }: { children: Snippet } = $props();

  const pages = [
    { label: "All", path: "/" },
    { label: "Lazy", path: "/lazy" },
    { label: "Forms", path: "/forms" },
    { label: "Context", path: "/contexts" },
    { label: "Dropdown Lists", path: "/dropdown-list" },
    { label: "Component Error", path: "/component-error" },
    { label: "Non Async Suspense", path: "/non-async-suspense" },
    { label: "Stacked Suspense", path: "/stacked-suspense" },
    { label: "PokeDex List", path: "/poke-dex" },
    { label: "PokeDex List with Await", path: "/poke-dex-await" },
    { label: "Redirect", path: "/redirect" },
    { label: "Params", path: "/params/1?id=1", activePath: "/params/" },
  ];
</script>

<svelte:head>
  <title>Vynn SSR Sandbox</title>
  <meta name="description" content="A server-rendered application built with Svelte 5." />
</svelte:head>

<div class="flex">
  <nav class="flex h-screen w-1/8">
    <ul class="menu bg-base-200 rounded-box gap-2 w-full">
      {#each pages as item}
        <li>
          <a
            href={item.path}
            class:menu-active={page.url.pathname === item.path ||
              (item.activePath !== undefined && page.url.pathname.startsWith(item.activePath))}
          >
            {item.label}
          </a>
        </li>
      {/each}
      <li>{"<div>Escaped HTML</div>"}</li>
    </ul>
  </nav>

  <div class="flex-1 overflow-auto h-screen p-4">
    <div class="container mx-auto">
      <div class="flex flex-col gap-8">
        {@render children()}
        <div id="portal-target"></div>
        <PortalNotice />
      </div>
    </div>
  </div>
</div>
