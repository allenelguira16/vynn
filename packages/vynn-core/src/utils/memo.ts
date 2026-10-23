export function memo<T>(getter: () => T): () => T {
  let initialized = false;
  let value: T;

  return () => {
    if (initialized) {
      return value;
    }

    const result = getter();

    value = result;
    initialized = true;

    return result;
  };
}
