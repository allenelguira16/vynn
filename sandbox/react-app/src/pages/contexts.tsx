import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Template } from "../components/template";

type LocalName = {
  name: string;
  setName: (name: string) => void;
};

const LocalNameContext = createContext<LocalName | null>(null);

function NameForm(props: { children: ReactNode }) {
  const [name, setName] = useState("asd");

  return (
    <LocalNameContext.Provider value={{ name, setName }}>
      {props.children}
    </LocalNameContext.Provider>
  );
}

function Wrapper(props: { children: ReactNode }) {
  return (
    <>
      <div>Hi</div>
      {props.children}
    </>
  );
}

function ContextInput() {
  const context = useContext(LocalNameContext);
  const [count, setCount] = useState(0);

  if (!context) {
    throw new Error("ContextInput must be nested under NameForm.");
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCount((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <>
      <div>Name: {context.name}</div>
      <div>Name: {context.name} Hi</div>
      <input
        type="text"
        name="name"
        className="input"
        onChange={(event) => context.setName(event.target.value)}
        placeholder="name"
        autoComplete="off"
        value={context.name}
      />{" "}
      {count}
    </>
  );
}

export default function ContextsPage() {
  return (
    <Template title="Contexts">
      <NameForm><ContextInput /></NameForm>
      <NameForm>
        <Wrapper><ContextInput /></Wrapper>
      </NameForm>
    </Template>
  );
}
