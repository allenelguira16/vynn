import { createContext } from "preact";
import { useContext, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

export type Name = {
  firstName: string;
  lastName: string;
};

type NameContextValue = {
  name: Name;
  setName: (name: Name) => void;
};

const NameContext = createContext<NameContextValue>({
  name: { firstName: "First name", lastName: "Last name" },
  setName: () => {},
});

export function NameProvider(props: { children: ComponentChildren }) {
  const [name, setName] = useState<Name>({
    firstName: "First name",
    lastName: "Last name",
  });

  return (
    <NameContext.Provider value={{ name, setName }}>
      {props.children}
    </NameContext.Provider>
  );
}

export function useName() {
  return useContext(NameContext);
}
