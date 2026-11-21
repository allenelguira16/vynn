export type PokemonEntry = {
  name: string;
  url: string;
};

export type PokeDexData = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PokemonEntry[];
};

export const INITIAL_POKEDEX_URL =
  "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20";

export async function getPokedex(fetcher: typeof fetch, url: string): Promise<PokeDexData> {
  const response = await fetcher(`/api/pokedex?url=${encodeURIComponent(url)}`);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `PokéAPI request failed with status ${response.status}`);
  }

  return (await response.json()) as PokeDexData;
}
