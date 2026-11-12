import { $store } from "vynn";

export const name = $store(() => ({
  firstName: "First name",
  lastName: "Last name",
}));

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type PokeDexData = {
  count: number;
  next: string | null;
  previous: string | null;
  results: {
    name: string;
    url: string;
  }[];
};

export async function getPokedex(url: string) {
  "use server";

  // await sleep(1000);

  const response = await fetch(url);
  return (await response.json()) as PokeDexData;
}
