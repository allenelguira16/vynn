/**
 * Place newly discovered preload links in document.head from a streamed HTML
 * response without leaving link elements inside the hydrated application root.
 */
export function injectSsrPreloadLinks(links: string): string {
  if (!links) return "";

  const serialized = JSON.stringify(links).replace(/</g, "\\u003c");

  return (
    `<script>document.head.insertAdjacentHTML("beforeend",${serialized});` +
    "document.currentScript.remove()</script>"
  );
}
