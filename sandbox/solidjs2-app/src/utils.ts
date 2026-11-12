import { createStore } from "solid-js";

export const [name, setName] = createStore({
  firstName: "First name",
  lastName: "Last name",
});

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

export async function getPokedex(url: string): Promise<PokeDexData> {
  "use server";

  // Restrict server-side requests to the intended API endpoint.
  const parsedUrl = new URL(url);

  if (parsedUrl.origin !== "https://pokeapi.co" || parsedUrl.pathname !== "/api/v2/pokemon/") {
    throw new Error("Invalid PokéAPI URL");
  }

  parsedUrl.searchParams.set("limit", "20");

  const response = await fetch(parsedUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch Pokémon: ${response.status}`);
  }

  return (await response.json()) as PokeDexData;
}
