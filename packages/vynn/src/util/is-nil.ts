/**
 * check if a value is null, undefined, or false
 *
 * @param value - The value to check if it is null, undefined, or false.
 * @returns True if the value is null, undefined, or false.
 */
export const isNil = (value: unknown): value is null | undefined | false => {
  return value === undefined || value === null || value === false;
};
