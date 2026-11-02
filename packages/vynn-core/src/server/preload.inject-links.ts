/**
 * Place newly discovered preload links in document.head from a streamed HTML
 * response without leaving link elements inside the hydrated application root.
 */
export function injectSsrPreloadLinks(links: string): string {
  if (!links) return "";

  const serialized = JSON.stringify(links).replace(/</g, "\\u003c");

  return `<script _$int>(()=>{const e=document.createElement("template");e.innerHTML=${serialized},e.content.querySelectorAll("link").forEach(e=>{e.setAttribute("_$int","")}),document.head.append(e.content)})(),document.currentScript.remove();</script>`;
}
