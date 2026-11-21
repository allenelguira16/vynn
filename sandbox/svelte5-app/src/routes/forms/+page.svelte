<script lang="ts">
  import Template from "#lib/components/Template.svelte";
  import { name } from "#lib/state.svelte.js";

  let count = $state(0);
  let double = $derived(count * 2);
</script>

<Template title="Forms">
  <div>
    <div>
      <label class="break-all" for="name-input2">Hi {name.firstName}</label>
      <div>
        <input class="input" type="text" value={name.firstName} id="name-input2" readonly />
      </div>
    </div>
    <div>
      {count}
      <div>Count: {count}</div>
      <div>Double Count: {double}</div>
      <button class="btn" disabled={count >= 5} onclick={() => count++}>
        Add counter
      </button>
      <div>{#if count <= 3}<div>Hi</div>{:else}string{/if}</div>
      <div>
        <label class="break-all" for="name-input">
          Name {name.firstName} <span>Hi</span>
        </label>
        <div>
          <input
            id="name-input"
            type="text"
            class="input"
            oninput={(event) => (name.firstName = event.currentTarget.value)}
            value={name.firstName}
          />
        </div>
      </div>
    </div>
  </div>
</Template>
