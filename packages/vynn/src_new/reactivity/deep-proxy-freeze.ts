type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export function deepProxyFreeze<T extends object>(obj: T): DeepReadonly<T> {
  const handler: ProxyHandler<any> = {
    set(_target, _prop, _value) {
      // Ignore all writes
      return true; // pretend success so no TypeError in strict mode
    },
    deleteProperty() {
      // Ignore deletes
      return true;
    },
  };

  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (typeof value === "object" && value !== null) {
      (obj as any)[key] = deepProxyFreeze(value);
    }
  }

  return new Proxy(obj, handler) as DeepReadonly<T>;
}
