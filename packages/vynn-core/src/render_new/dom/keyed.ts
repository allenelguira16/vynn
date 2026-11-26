import type { DOMTemplateKey } from "./program";

export type DOMTemplateKeyMarkerEdge = "start" | "end";

export interface DOMTemplateKeyMarker {
  readonly key: DOMTemplateKey;
  readonly edge: DOMTemplateKeyMarkerEdge;
}

function encodeKeyValue(value: string): string {
  let encoded = "";
  for (let index = 0; index < value.length; index++) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return encoded;
}

function decodeKeyValue(value: string): string | null {
  if (value.length % 4 !== 0 || !/^[0-9a-f]*$/.test(value)) return null;

  let decoded = "";
  for (let index = 0; index < value.length; index += 4) {
    decoded += String.fromCharCode(Number.parseInt(value.slice(index, index + 4), 16));
  }
  return decoded;
}

/** Creates a comment marker for one keyed template-program boundary. */
export function createDOMTemplateKeyMarkerData(
  key: DOMTemplateKey,
  edge: DOMTemplateKeyMarkerEdge,
): string {
  if (
    typeof key !== "string" &&
    typeof key !== "number" &&
    typeof key !== "bigint"
  ) {
    throw new TypeError(
      "[vynn render_new]: Keyed template programs require string, number, or bigint keys.",
    );
  }

  const kind = typeof key === "string" ? "s" : typeof key === "number" ? "n" : "b";
  return "__vynn_render_new_keyed_item_" +
    kind + "_" + encodeKeyValue(String(key)) + "_" + edge + "__";
}

/** Reads a keyed-item boundary comment, returning null for unrelated comments. */
export function readDOMTemplateKeyMarker(node: Node): DOMTemplateKeyMarker | null {
  if (!node || node.nodeType !== 8) return null;

  const match = /^__vynn_render_new_keyed_item_(s|n|b)_([0-9a-f]*)_(start|end)__$/
    .exec((node as Comment).data);
  if (!match) return null;

  const raw = decodeKeyValue(match[2]!);
  if (raw === null) return null;

  let key: DOMTemplateKey;
  switch (match[1]) {
    case "s":
      key = raw;
      break;
    case "n": {
      const value = Number(raw);
      if (String(value) !== raw) return null;
      key = value;
      break;
    }
    case "b":
      try {
        key = BigInt(raw);
      } catch {
        return null;
      }
      if (String(key) !== raw) return null;
      break;
    default:
      return null;
  }

  return {
    key,
    edge: match[3] as DOMTemplateKeyMarkerEdge,
  };
}
