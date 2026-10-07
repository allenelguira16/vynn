import { $state, $store, createContext, JSX, onDestroy } from "vynn";

import { Template } from "../components/template";

export const Contexts = () => {
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
};

const [NameProvider, useNameContext] = createContext<{ name: string }>();

const Form = (props: { children: JSX.Element }) => {
  const state = $store<{ name: string }>({ name: "asd" });

  return <NameProvider value={state}>{props.children}</NameProvider>;
};

function Wrapper({ children }: { children: JSX.Element }) {
  return (
    <>
      <div>Hi</div> {children}
    </>
  );
}

const Input = () => {
  const forms = useNameContext();
  // console.log(forms);

  const i = $state(0);

  const cleanup = setInterval(() => {
    i.value++;
  }, 1000);

  onDestroy(() => {
    // console.log("cleared tanga");
    clearInterval(cleanup);
  });

  const nameEl = <>Name: {forms.name} Hi </>;

  // console.log("hi");

  // $effect(() => {
  //   console.log(i.value);
  // });

  return (
    <>
      <div>Name: {forms.name}</div>
      {nameEl}
      <input
        type="text"
        name="name"
        onInput={(event: any) => (forms.name = event.currentTarget.value)}
        placeholder="name"
        autoComplete="off"
        value={forms.name}
      />{" "}
      {i.value}
    </>
  );
};
