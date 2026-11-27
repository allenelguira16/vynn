<script lang="ts">
  import Template from "#lib/components/Template.svelte";

  type Row = {
    id: number;
    value: number;
  };

  const INITIAL_ROW_COUNT = 1000;

  function createRows(): Row[] {
    return Array.from({ length: INITIAL_ROW_COUNT }, (_, index) => ({
      id: index + 1,
      value: index + 1,
    }));
  }

  let rows = $state<Row[]>(createRows());
  let nextID = INITIAL_ROW_COUNT + 1;

  function updateOne() {
    if (rows.length === 0) return;
    rows[Math.min(499, rows.length - 1)].value++;
  }

  function updateOneHundred() {
    for (let index = 0; index < rows.length; index += 10) {
      rows[index].value++;
    }
  }

  function appendOneHundred() {
    rows.push(
      ...Array.from({ length: 100 }, () => {
        const id = nextID++;
        return { id, value: id };
      }),
    );
  }

  function removeMiddle() {
    if (rows.length === 0) return;
    rows.splice(Math.floor(rows.length / 2), 1);
  }

  function reverseRows() {
    rows.reverse();
  }

  function resetRows() {
    rows = createRows();
    nextID = INITIAL_ROW_COUNT + 1;
  }
</script>

<Template title="1,000 Reactive Rows">
  <div class="flex flex-wrap items-center gap-2 mb-3">
    <span class="text-sm font-medium">Rows: {rows.length.toLocaleString()}</span>
    <button class="btn btn-sm" onclick={updateOne}>Update one</button>
    <button class="btn btn-sm" onclick={updateOneHundred}>Update 100</button>
    <button class="btn btn-sm" onclick={appendOneHundred}>Append 100</button>
    <button class="btn btn-sm" onclick={removeMiddle}>Remove middle</button>
    <button class="btn btn-sm" onclick={reverseRows}>Reverse</button>
    <button class="btn btn-sm btn-ghost" onclick={resetRows}>Reset</button>
  </div>

  <p class="text-sm opacity-70 mb-2">
    Identical data and interactions across the framework sandboxes. Update a row,
    change multiple rows, or modify the list structure.
  </p>

  <div class="max-h-[70vh] overflow-auto rounded-box border border-base-300">
    <table class="table table-sm table-zebra">
      <thead class="sticky top-0 z-10">
        <tr>
          <th class="w-24">ID</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr>
            <td>{row.id}</td>
            <td>Hi key-{row.value}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Template>
