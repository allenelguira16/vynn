import { createStore } from "solid-js";

export const [name, setName] = createStore({
  firstName: "First name",
  lastName: "Last name",
});

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
