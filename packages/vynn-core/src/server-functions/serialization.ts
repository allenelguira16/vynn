type EncodedValue = unknown[];

export type ServerFunctionCodec<T = unknown> = {
  /** Stable codec identifier shared by the client and server bundles. */
  tag: string;
  /** Returns true when this codec owns the supplied value. */
  test(value: unknown): value is T;
  /** Converts the value into data that can itself be serialized by Vynn. */
  serialize(value: T): unknown;
  /** Reconstructs the value from decoded codec data. */
  deserialize(value: unknown): T;
};

type RegisteredServerFunctionCodec = {
  tag: string;
  test(value: unknown): boolean;
  serialize(value: unknown): unknown;
  deserialize(value: unknown): unknown;
};

const codecs = new Map<string, RegisteredServerFunctionCodec>();

const typedArrayFactories: Record<string, (buffer: ArrayBuffer) => ArrayBufferView> = {
  Int8Array: (buffer) => new Int8Array(buffer),
  Uint8Array: (buffer) => new Uint8Array(buffer),
  Uint8ClampedArray: (buffer) => new Uint8ClampedArray(buffer),
  Int16Array: (buffer) => new Int16Array(buffer),
  Uint16Array: (buffer) => new Uint16Array(buffer),
  Int32Array: (buffer) => new Int32Array(buffer),
  Uint32Array: (buffer) => new Uint32Array(buffer),
  Float32Array: (buffer) => new Float32Array(buffer),
  Float64Array: (buffer) => new Float64Array(buffer),
  BigInt64Array: (buffer) => new BigInt64Array(buffer),
  BigUint64Array: (buffer) => new BigUint64Array(buffer),
};

const MAX_DEPTH = 100;

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const decodeBase64 = (value: string): ArrayBuffer => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

/**
 * Registers an application-defined serializer for a custom value type.
 *
 * Register the same codec in client and server startup code. Codec tags are
 * part of the wire format and must remain stable across deployments.
 */
export function registerServerFunctionCodec<T>(
  codec: ServerFunctionCodec<T>,
): () => void {
  if (
    !codec ||
    typeof codec.tag !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(codec.tag) ||
    typeof codec.test !== "function" ||
    typeof codec.serialize !== "function" ||
    typeof codec.deserialize !== "function"
  ) {
    throw new TypeError("[Vynn] Invalid server-function codec.");
  }

  if (codecs.has(codec.tag)) {
    throw new Error("[Vynn] A server-function codec is already registered for tag " + codec.tag + ".");
  }

  const registered: RegisteredServerFunctionCodec = {
    tag: codec.tag,
    test: (value) => codec.test(value),
    serialize: (value) => {
      if (!codec.test(value)) {
        throw new TypeError("[Vynn] Server-function codec received an unsupported value.");
      }
      return codec.serialize(value);
    },
    deserialize: (value) => codec.deserialize(value),
  };
  codecs.set(codec.tag, registered);

  return () => {
    if (codecs.get(codec.tag) === registered) codecs.delete(codec.tag);
  };
}

function encodeValue(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
): EncodedValue {
  if (depth > MAX_DEPTH) {
    throw new RangeError("[Vynn] Server-function values exceed the maximum serialization depth.");
  }

  if (value === null) return ["null"];

  switch (typeof value) {
    case "undefined":
      return ["undefined"];
    case "string":
      return ["string", value];
    case "boolean":
      return ["boolean", value];
    case "number":
      if (Number.isNaN(value)) return ["number", "NaN"];
      if (value === Infinity) return ["number", "Infinity"];
      if (value === -Infinity) return ["number", "-Infinity"];
      if (Object.is(value, -0)) return ["number", "-0"];
      return ["number", value];
    case "bigint":
      return ["bigint", value.toString()];
    case "function":
    case "symbol":
      throw new TypeError("[Vynn] Functions and symbols cannot be sent through server functions.");
    case "object":
      break;
    default:
      throw new TypeError("[Vynn] Unsupported server-function value.");
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new TypeError("[Vynn] Cyclic server-function values are not supported.");
  }

  ancestors.add(object);

  try {
    if (Array.isArray(value)) {
      const items: EncodedValue[] = [];
      for (let index = 0; index < value.length; index++) {
        items.push(index in value ? encodeValue(value[index], ancestors, depth + 1) : ["hole"]);
      }
      return ["array", items];
    }

    if (value instanceof Date) {
      return ["date", Number.isNaN(value.getTime()) ? null : value.toISOString()];
    }

    if (value instanceof URL) return ["url", value.href];

    if (value instanceof URLSearchParams) {
      return ["url-search-params", Array.from(value.entries())];
    }

    if (value instanceof RegExp) {
      return ["regexp", value.source, value.flags, value.lastIndex];
    }

    if (value instanceof Map) {
      return [
        "map",
        Array.from(value.entries(), ([key, item]) => [
          encodeValue(key, ancestors, depth + 1),
          encodeValue(item, ancestors, depth + 1),
        ]),
      ];
    }

    if (value instanceof Set) {
      return ["set", Array.from(value, (item) => encodeValue(item, ancestors, depth + 1))];
    }

    if (value instanceof Error) {
      const error = value as Error & { cause?: unknown };
      return [
        "error",
        error.name,
        error.message,
        "cause" in error ? encodeValue(error.cause, ancestors, depth + 1) : null,
      ];
    }

    if (value instanceof ArrayBuffer) {
      return ["array-buffer", encodeBase64(new Uint8Array(value))];
    }

    if (ArrayBuffer.isView(value)) {
      if (!(value.buffer instanceof ArrayBuffer)) {
        throw new TypeError("[Vynn] SharedArrayBuffer-backed views are not supported.");
      }

      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
      if (value instanceof DataView) {
        return ["data-view", encodeBase64(bytes)];
      }

      let constructorName = (value as { constructor: { name: string } }).constructor.name;
      if (constructorName === "Buffer") constructorName = "Uint8Array";
      if (!typedArrayFactories[constructorName]) {
        throw new TypeError("[Vynn] Unsupported typed array: " + constructorName + ".");
      }
      return ["typed-array", constructorName, encodeBase64(bytes)];
    }

    for (const codec of codecs.values()) {
      if (codec.test(value)) {
        return ["custom", codec.tag, encodeValue(codec.serialize(value), ancestors, depth + 1)];
      }
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        "[Vynn] Unsupported server-function object. Register a codec for custom value types.",
      );
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("[Vynn] Symbol-keyed properties cannot be sent through server functions.");
    }

    const entries = Object.keys(value).map((key) => [
      key,
      encodeValue((value as Record<string, unknown>)[key], ancestors, depth + 1),
    ]);

    return ["object", prototype === null, entries];
  } finally {
    ancestors.delete(object);
  }
}

/**
 * Encodes supported JavaScript values into a JSON-safe tagged representation.
 * The representation is collision-safe because plain objects are encoded as
 * entry lists rather than being mixed with protocol marker properties.
 */
export function serializeServerFunctionValue(value: unknown): unknown {
  return encodeValue(value, new WeakSet(), 0);
}

function expectArray(value: unknown, tag: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError("[Vynn] Invalid serialized server-function " + tag + " value.");
  }
  return value;
}

function decodeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    throw new RangeError("[Vynn] Server-function values exceed the maximum serialization depth.");
  }

  const tuple = expectArray(value, "protocol");
  const tag = tuple[0];

  if (typeof tag !== "string") {
    throw new TypeError("[Vynn] Invalid serialized server-function value.");
  }

  switch (tag) {
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "string":
      if (typeof tuple[1] !== "string") throw new TypeError("[Vynn] Invalid serialized string.");
      return tuple[1];
    case "boolean":
      if (typeof tuple[1] !== "boolean") throw new TypeError("[Vynn] Invalid serialized boolean.");
      return tuple[1];
    case "number":
      if (tuple[1] === "NaN") return NaN;
      if (tuple[1] === "Infinity") return Infinity;
      if (tuple[1] === "-Infinity") return -Infinity;
      if (tuple[1] === "-0") return -0;
      if (typeof tuple[1] !== "number") throw new TypeError("[Vynn] Invalid serialized number.");
      return tuple[1];
    case "bigint":
      if (typeof tuple[1] !== "string") throw new TypeError("[Vynn] Invalid serialized bigint.");
      return BigInt(tuple[1]);
    case "array": {
      const items = expectArray(tuple[1], "array");
      const result: unknown[] = [];
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (Array.isArray(item) && item[0] === "hole") {
          result.length++;
        } else {
          result.push(decodeValue(item, depth + 1));
        }
      }
      return result;
    }
    case "object": {
      const entries = expectArray(tuple[2], "object");
      const result = tuple[1] === true ? Object.create(null) as Record<string, unknown> : {};
      for (const entry of entries) {
        const pair = expectArray(entry, "object entry");
        if (typeof pair[0] !== "string") throw new TypeError("[Vynn] Invalid serialized object key.");
        Object.defineProperty(result, pair[0], {
          value: decodeValue(pair[1], depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    case "date":
      return tuple[1] === null ? new Date(Number.NaN) : new Date(String(tuple[1]));
    case "url":
      return new URL(String(tuple[1]));
    case "url-search-params":
      return new URLSearchParams(expectArray(tuple[1], "URLSearchParams") as [string, string][]);
    case "regexp": {
      const result = new RegExp(String(tuple[1]), String(tuple[2]));
      result.lastIndex = Number(tuple[3]) || 0;
      return result;
    }
    case "map": {
      const entries = expectArray(tuple[1], "Map");
      const result = new Map<unknown, unknown>();
      for (const entry of entries) {
        const pair = expectArray(entry, "Map entry");
        result.set(decodeValue(pair[0], depth + 1), decodeValue(pair[1], depth + 1));
      }
      return result;
    }
    case "set":
      return new Set(expectArray(tuple[1], "Set").map((item) => decodeValue(item, depth + 1)));
    case "error": {
      const result = new Error(String(tuple[2]));
      result.name = String(tuple[1] || "Error");
      if (tuple[3] !== null) {
        Object.defineProperty(result, "cause", {
          value: decodeValue(tuple[3], depth + 1),
          configurable: true,
        });
      }
      return result;
    }
    case "array-buffer":
      return decodeBase64(String(tuple[1]));
    case "data-view":
      return new DataView(decodeBase64(String(tuple[1])));
    case "typed-array": {
      const factory = typedArrayFactories[String(tuple[1])];
      if (!factory) throw new TypeError("[Vynn] Unsupported serialized typed array.");
      return factory(decodeBase64(String(tuple[2])));
    }
    case "custom": {
      const codec = codecs.get(String(tuple[1]));
      if (!codec) {
        throw new TypeError(
          "[Vynn] No server-function codec is registered for tag " + String(tuple[1]) + ".",
        );
      }
      return codec.deserialize(decodeValue(tuple[2], depth + 1));
    }
    default:
      throw new TypeError("[Vynn] Unknown serialized server-function value tag: " + tag + ".");
  }
}

/** Decodes values produced by serializeServerFunctionValue(). */
export function deserializeServerFunctionValue(value: unknown): unknown {
  return decodeValue(value, 0);
}
