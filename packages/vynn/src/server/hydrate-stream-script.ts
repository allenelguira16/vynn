import { JSX, jsx } from "./jsx-runtime";

/**
 * Stream Hydration Script, used for hydrating async
 *
 * @returns
 */
export function HydrateStreamScript(): JSX.Element {
  function hydrateAsync(id: string) {
    const tpl = document.querySelector(`[async-id="${id}"]`) as HTMLTemplateElement | null;
    if (!tpl) return;

    const html = tpl.content.cloneNode(true);

    // markers are just comment nodes in the DOM
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    let start: Comment | null = null;
    let end: Comment | null = null;

    while (walker.nextNode()) {
      const node = walker.currentNode as Comment;
      if (node.nodeValue === `~$:${id}`) start = node;
      if (node.nodeValue === `/$:${id}`) end = node;
    }

    if (start && end) {
      const range = document.createRange();
      range.setStartAfter(start);
      range.setEndBefore(end);
      range.deleteContents();
      range.insertNode(html);

      start.remove();
      end.remove();
    }

    tpl.remove();
  }

  return jsx("script", {
    html: `window.__hydrateAsync = ${hydrateAsync.toString()};window.__SSR_STREAMING_APP__ = true;`,
  }) as JSX.Element;
}
