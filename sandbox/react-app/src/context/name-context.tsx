import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export type NameState = {
  firstName: string;
  lastName: string;
};

type NameContextValue = {
  name: NameState;
  setName: Dispatch<SetStateAction<NameState>>;
};

const NameContext = createContext<NameContextValue | null>(null);

export function NameProvider(props: { children: ReactNode }) {
  const [name, setName] = useState<NameState>({
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
  const value = useContext(NameContext);

  if (!value) {
    throw new Error("useName must be used within NameProvider.");
  }

  return value;
}
