import { JSX } from "@solidjs/web";
import {
  createStore,
  createSignal,
  onSettled,
  createContext,
  useContext,
  StoreSetter,
} from "solid-js";

import { Template } from "../components/template";

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

const NameProvider = createContext<
  [
    get: {
      name: string;
    },
    set: StoreSetter<{
      name: string;
    }>,
  ]
>();

const Form = (props: { children: JSX.Element }) => {
  const state = createStore<{ name: string }>({ name: "asd" });

  return <NameProvider value={state}>{props.children}</NameProvider>;
};

function Wrapper(props: { children: JSX.Element }) {
  return (
    <>
      <div>Hi</div> {props.children}
    </>
  );
}

const Input = () => {
  const [forms, setForms] = useContext(NameProvider);
  // console.log(forms);

  const [count, setCount] = createSignal(0);

  onSettled(() => {
    const cleanup = setInterval(() => {
      // i.value++;
      setCount(count() + 1);
    }, 1000);

    return () => {
      clearInterval(cleanup);
    };
  });

  const nameEl = () => <>Name: {forms.name} Hi </>;

  // console.log("hi");

  // $effect(() => {
  //   console.log(i.value);
  // });

  return (
    <>
      <div>Name: {forms.name}</div>
      {nameEl()}
      <input
        type="text"
        name="name"
        class="input"
        onInput={(event: any) =>
          setForms(() => ({ name: event.currentTarget.value }))
        }
        placeholder="name"
        autocomplete="off"
        value={forms.name}
      />{" "}
      {count()}
    </>
  );
};
