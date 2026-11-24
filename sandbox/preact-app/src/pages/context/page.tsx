import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Template } from "../../components/template";

type FormState = { name: string };
const FormContext = createContext<{
  state: FormState;
  setState: (value: FormState) => void;
}>({
  state: { name: "asd" },
  setState: () => {},
});

export default function ContextPage() {
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

function Form(props: { children: ComponentChildren }) {
  const [state, setState] = useState<FormState>({ name: "asd" });

  return (
    <FormContext.Provider value={{ state, setState }}>
      {props.children}
    </FormContext.Provider>
  );
}

function Wrapper(props: { children: ComponentChildren }) {
  return (
    <>
      <div>Hi</div> {props.children}
    </>
  );
}

function Input() {
  const { state, setState } = useContext(FormContext);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const cleanup = setInterval(() => setCount((value) => value + 1), 1000);
    return () => clearInterval(cleanup);
  }, []);

  const nameEl = () => <>Name: {state.name} Hi </>;

  return (
    <>
      <div>Name: {state.name}</div>
      {nameEl()}
      <input
        type="text"
        name="name"
        class="input"
        onInput={(event) => setState({ ...state, name: event.currentTarget.value })}
        placeholder="name"
        autoComplete="off"
        value={state.name}
      />{" "}
      {count}
    </>
  );
}
