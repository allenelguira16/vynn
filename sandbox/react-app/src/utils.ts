export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
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
  const parsedUrl = new URL(url);

  if (
    parsedUrl.origin !== "https://pokeapi.co" ||
    parsedUrl.pathname !== "/api/v2/pokemon/"
  ) {
    throw new Error("Invalid PokéAPI URL.");
  }

  parsedUrl.searchParams.set("limit", "20");

  const endpoint =
    typeof window === "undefined"
      ? parsedUrl.href
      : "/api/pokedex?url=" + encodeURIComponent(parsedUrl.href);

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Failed to fetch Pokémon: " + response.status);
  }

  return (await response.json()) as PokeDexData;
}

const pokedexRequests = new Map<string, Promise<PokeDexData>>();

export function getPokedexResource(url: string) {
  const existing = pokedexRequests.get(url);

  if (existing) return existing;

  const request = getPokedex(url);
  pokedexRequests.set(url, request);
  return request;
}

export function clearPokedexResources() {
  pokedexRequests.clear();
}
