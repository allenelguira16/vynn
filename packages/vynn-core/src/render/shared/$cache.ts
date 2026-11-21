import { memo } from "../utils/memo";

export function $cache<T>(getter: () => T): () => T {
  return memo(getter);
}
