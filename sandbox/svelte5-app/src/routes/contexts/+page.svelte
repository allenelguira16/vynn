<script lang="ts">
  import NameForm from "#lib/components/NameForm.svelte";
  import NameInput from "#lib/components/NameInput.svelte";
  import NameWrapper from "#lib/components/NameWrapper.svelte";
  import Template from "#lib/components/Template.svelte";
</script>

<Template title="Contexts">
  <NameForm initial="asd">
    <NameInput />
  </NameForm>
  <NameForm initial="asd">
    <NameWrapper>
      <NameInput />
    </NameWrapper>
  </NameForm>
</Template>
