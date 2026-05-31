import { $state, $store, createContext, JSX, onDestroy, useContext } from "vynn";

import { Template } from "~/components/Template";

export default function Contexts() {
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

const FormContext = createContext<{ name: string }>();

function Form({ children }: { children: () => JSX.Element }) {
  const state = $store<{ name: string }>({ name: "" });

  return <FormContext.Provider value={state}>{children()}</FormContext.Provider>;
}

function Wrapper({ children }: { children: () => JSX.Element }) {
  return (
    <>
      <div>Hi</div> {children()}
    </>
  );
}

function Input() {
  const forms = useContext(FormContext);

  const i = $state(0);

  const cleanup = setInterval(() => {
    i.value++;
  }, 1000);

  onDestroy(() => {
    clearInterval(cleanup);
  });

  const nameEl = <div>Name: {forms.name} Hi</div>;

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
}
