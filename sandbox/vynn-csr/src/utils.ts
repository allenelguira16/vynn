import { $store } from "vynn";

export const name = $store({
  firstName: "First name",
  lastName: "Last name",
});

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
