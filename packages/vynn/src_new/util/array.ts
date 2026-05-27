/**
 * convert an item to an array
 *
 * @param item - The item to convert to an array.
 * @returns The item as an array.
 */
export const toArray = <T>(item: T) => {
  return (Array.isArray(item) ? item : [item]).flat(Infinity) as T[];
};

/**
 * convert an item to an array
 *
 * @param item - The item to convert to an array.
 * @returns The item as an array.
 */
export const flattenArray = <T>(items: T[]) => {
  return items.flat(Infinity) as T[];
};
