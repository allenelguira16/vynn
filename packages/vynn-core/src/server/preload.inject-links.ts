/**
 * Place newly discovered preload links in document.head from a streamed HTML
 * response without leaving link elements inside the hydrated application root.
 */
export function injectSsrPreloadLinks(links: string): string {
  if (!links) return "";
  const serialized = JSON.stringify(links);
  return (
    '<script>(function(){var template=document.createElement("template");' +
    "template.innerHTML=" +
    serialized +
    ";document.head.appendChild(template.content);document.currentScript.remove()})()</script>"
  );
}
