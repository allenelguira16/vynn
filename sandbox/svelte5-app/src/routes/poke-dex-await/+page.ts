import type { PageLoad } from "./$types";
import { getPokedex, INITIAL_POKEDEX_URL } from "#lib/pokedex.js";

export const load: PageLoad = async ({ fetch }) => ({
  initial: await getPokedex(fetch, INITIAL_POKEDEX_URL),
});
