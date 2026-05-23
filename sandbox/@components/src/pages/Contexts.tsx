import { $effect, $state, $store, createContext, JSX, memo, onDestroy } from "vynn";

import { Template } from "~/components/Template";

export function Contexts() {
  return (
    <Template title="Contexts">
      <Form>
        <Input />
      </Form>
      <Form>
        <Wrapper>
          <Input />
        </Wrapper>
      </Form>
    </Template>
  );
}

const [FormProvider, formContext] = createContext<{ name: string }>();

function Form({ children }: { children: () => JSX.Element }) {
  const state = $store<{ name: string }>({ name: "asd" });

  return <FormProvider value={state}>{children()}</FormProvider>;
}

function Wrapper({ children }: { children: () => JSX.Element }) {
  return (
    <>
      <div>Hi</div> {children()}
    </>
  );
}

const Input = memo(() => {
  const forms = formContext();

  const i = $state(0);

  const cleanup = setInterval(() => {
    i.value++;
  }, 1000);

  onDestroy(() => {
    console.log("cleared tanga");
    clearInterval(cleanup);
  });

  const nameEl = <div>Name: {forms.name} Hi</div>;

  $effect(() => {
    console.log(i.value);
  });

  return (
    <>
      <div>Name: {forms.name}</div>
      {nameEl}
      <input
        type="text"
        name="name"
        onInput={(event) => (forms.name = event.currentTarget.value)}
        placeholder="name"
        autoComplete="off"
        value={forms.name}
      />{" "}
      {i.value}
    </>
  );
});
