import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import {
  createDOMTemplateKeyMarkerData,
  readDOMTemplateKeyMarker,
} from "../src/render_new/dom/keyed";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new keyed markers", () => {
  it("round-trips string keys that contain comment-sensitive characters", () => {
    const document = createDocument();
    const key = "row --> end 🚀";
    const marker = document.createComment(createDOMTemplateKeyMarkerData(key, "start"));

    expect(marker.data).not.toContain("-->");
    expect(readDOMTemplateKeyMarker(marker)).toEqual({ key, edge: "start" });
  });

  it("round-trips number and bigint keys without converting their types", () => {
    const document = createDocument();
    const numberMarker = document.createComment(
      createDOMTemplateKeyMarkerData(-12.5, "end"),
    );
    const bigintKey = 900719925474099312345n;
    const bigintMarker = document.createComment(
      createDOMTemplateKeyMarkerData(bigintKey, "start"),
    );

    expect(readDOMTemplateKeyMarker(numberMarker)).toEqual({
      key: -12.5,
      edge: "end",
    });
    expect(readDOMTemplateKeyMarker(bigintMarker)).toEqual({
      key: bigintKey,
      edge: "start",
    });
  });

  it("ignores unrelated and malformed comments", () => {
    const document = createDocument();

    expect(readDOMTemplateKeyMarker(document.createComment("ordinary comment"))).toBeNull();
    expect(readDOMTemplateKeyMarker(
      document.createComment("__vynn_render_new_keyed_item_n_not-hex_start__"),
    )).toBeNull();
  });

  it("rejects unsupported keys before creating a marker", () => {
    expect(() => createDOMTemplateKeyMarkerData({ id: 1 } as never, "start"))
      .toThrow("string, number, or bigint");
  });
});
