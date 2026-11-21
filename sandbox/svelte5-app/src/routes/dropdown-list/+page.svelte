<script lang="ts">
  import Template from "#lib/components/Template.svelte";
  import { name } from "#lib/state.svelte.js";

  type SortDirection = "asc" | "desc";

  let showDropdown = $state(true);
  let sortDirection = $state<SortDirection>("asc");
  let numbers = $state(Array.from({ length: 8 }, (_, index) => index + 1));

  function handleSort() {
    numbers = [...numbers].sort((a, b) =>
      sortDirection === "desc" ? a - b : b - a,
    );
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  }

  function handleRandomize() {
    const result = [...numbers];

    for (let index = result.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }

    numbers = result;
  }

  function addDropdown() {
    if (numbers.length >= 8) return;
    const current = [...numbers].sort((a, b) => a - b);
    numbers = current.length ? [...current, current[current.length - 1] + 1] : [1];
  }

  function removeDropdown() {
    if (numbers.length > 0) numbers = numbers.slice(0, -1);
  }
</script>

<Template title="Dropdown List">
  <div class="flex flex-col gap-4">
    <div>
      <div class="flex gap-2 items-center">
        <span>Add Dropdown</span>
        <button class="btn" onclick={addDropdown}>+</button>
        <button class="btn" onclick={removeDropdown}>-</button>
      </div>
    </div>
    <div class="flex gap-2 items-center">
      <span>Sort</span>
      <button class="btn" onclick={handleSort}>
        {sortDirection === "asc" ? "↑" : "↓"}
      </button>
      <button class="btn" onclick={handleRandomize}>Randomize</button>
    </div>
    <div>
      <button class="btn" onclick={() => (showDropdown = !showDropdown)}>
        Unmount Dropdown List
      </button>
    </div>
    {#if showDropdown}
      <div class="flex gap-2 flex-col lg:flex-row">
        {#each numbers as number (number)}
          <div class="lg:w-[12.5%]">
            <details class="dropdown">
              <summary class="btn w-full">Open Dropdown {number}</summary>
              <ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                <li><button type="button">Item 1</button></li>
                <li><button type="button">Item 2</button></li>
              </ul>
            </details>
            <div class="break-all mt-4">Hi {name.firstName}</div>
          </div>
        {/each}
      </div>
    {/if}
    <div>Hi</div>
  </div>
</Template>
