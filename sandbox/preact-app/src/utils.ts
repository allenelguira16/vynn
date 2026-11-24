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

export async function getPokedex(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`PokéAPI request failed: ${response.status}`);
  }

  return (await response.json()) as PokeDexData;
}

export const createResourceCache = <T>() => {
  const cache = new Map<string, Promise<T>>();

  return (key: string, loader: () => Promise<T>) => {
    let value = cache.get(key);

    if (!value) {
      value = loader();
      cache.set(key, value);
      value.catch(() => cache.delete(key));
    }

    return value;
  };
};
