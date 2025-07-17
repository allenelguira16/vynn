'use strict';

const skipWrappingTags = /* @__PURE__ */ new Set(["title", "meta", "script", "style"]);
function flattenDOMContents(root) {
  const doms = [];
  let capture = false;
  let bufferEmpty = false;
  function flattenNode(node) {
    if (node instanceof Comment) {
      const comment = node.data.trim();
      if (comment === "!") {
        capture = true;
        bufferEmpty = true;
        node.remove();
      } else if (comment === "/") {
        capture = false;
        if (bufferEmpty) {
          const text = document.createTextNode("");
          node.parentNode?.insertBefore(text, node.nextSibling);
          doms.push(text);
          bufferEmpty = false;
        }
        node.remove();
      }
      return;
    }
    if (node instanceof HTMLElement) {
      doms.push(node);
      if (skipWrappingTags.has(node.tagName.toLowerCase())) {
        for (const child of [...node.childNodes]) {
          if (child instanceof Text) {
            doms.push(child);
          } else {
            flattenNode(child);
          }
        }
        return;
      }
    } else if (capture && node instanceof Text) {
      doms.push(node);
      bufferEmpty = false;
    }
    for (const child of [...node.childNodes]) {
      flattenNode(child);
    }
  }
  for (const child of [...root.childNodes]) {
    flattenNode(child);
  }
  return doms;
}

exports.flattenDOMContents = flattenDOMContents;
//# sourceMappingURL=flat-dom-contents-VGNcpsEI.js.map
