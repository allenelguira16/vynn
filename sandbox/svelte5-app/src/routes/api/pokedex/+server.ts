import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = url.searchParams.get("url");

  if (!target) {
    return json({ error: "A PokéAPI URL is required." }, { status: 400 });
  }

  let parsed: URL;

  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "The supplied URL is invalid." }, { status: 400 });
  }

  if (parsed.origin !== "https://pokeapi.co" || parsed.pathname !== "/api/v2/pokemon/") {
    return json({ error: "Only the PokéAPI Pokémon endpoint is allowed." }, { status: 400 });
  }

  parsed.searchParams.set("limit", "20");
  const response = await fetch(parsed);

  if (!response.ok) {
    return json({ error: `PokéAPI returned ${response.status}.` }, { status: response.status });
  }

  return json(await response.json());
};
