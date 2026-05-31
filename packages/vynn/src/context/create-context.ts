import { JSX } from "~/client/jsx-runtime";
import { getContext, setContext } from "~/lifecycle/owner";

/**
 * Create Context helper
 *
 * @returns Provider and context
 */
export function createContext<T>() {
  // let value: T;

  // function Provider(props: { value: T; children: () => JSX.Element }) {
  //   value = props.value;
  //   return props.children;
  // }

  // function getContext(): T {
  //   if (!value) {
  //     throw new Error("No provider found for context.");
  //   }
  //   return value;
  // }

  // return [Provider, getContext] as const;
  const id = Symbol();

  return {
    id,
    Provider: (props: { value: T; children: () => JSX.Element }) => () => {
      setContext(id, props.value);
      // console.log(props);
      return props.children;
    },
    // Provider: (props: { value: T; children: () => JSX.Element }) =>
    //   jsx(() => {
    //     setContext(id, props.value);

    //     return () => props.children;
    //   }),
  };
}

export function useContext<T>(context: ReturnType<typeof createContext<T>>) {
  // console.log(context);
  // $effect(() => {
  //   console.log();
  // });

  return getContext<T>(context.id)!;
}
