const stateMap = new Map<string, { states: any[] }>();

/**
 * Creates a state context associated with a specific component key
 * Useful for rendering arrays that does not use loop
 *
 * It is still recommended to use loop over normal arrays
 *
 * @param key unique key for string
 */
export const createStateContext = (key?: string) => {
  let instance: { states: any[] };

  if (key !== undefined) {
    if (!stateMap.has(key)) {
      stateMap.set(key, { states: [] });
    }
    instance = stateMap.get(key)!;
  } else {
    instance = { states: [] };
  }

  return { ...instance, index: 0 };
};
