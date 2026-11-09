import { INTERNAL_RANGE_END_MARKER, INTERNAL_RANGE_START_MARKER } from "../const";

/**
 * Place newly discovered preload links in document.head from a streamed HTML
 * response without leaving link elements inside the hydrated application root.
 */
export function injectSsrPreloadLinks(links: string): string {
  if (!links) return "";

  const serialized = JSON.stringify(links).replace(/</g, "\\u003c");
  const startMarker = JSON.stringify(INTERNAL_RANGE_START_MARKER);
  const endMarker = JSON.stringify(INTERNAL_RANGE_END_MARKER);

  return `<script>(()=>{const e=document.createElement("template");e.innerHTML=${serialized},document.head.append(document.createComment(${startMarker}),e.content,document.createComment(${endMarker}))})(),document.currentScript.remove();</script>`;
}
