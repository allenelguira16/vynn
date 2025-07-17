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
function flattenLazyDOMContents(root = document) {
  const START_RE = /^lazy:(\d+)$/;
  const END_RE = /^\/lazy:(\d+)$/;
  const result = [];
  const stack = [];
  function traverse(node) {
    if (node instanceof Comment) {
      const txt = node.data.trim();
      const start = txt.match(START_RE);
      if (start) {
        stack.push({ id: +start[1], nodes: [] });
        return;
      }
      const end = txt.match(END_RE);
      if (end) {
        const top = stack.pop();
        if (top && top.id === +end[1]) {
          result[top.id] = top.nodes;
        }
        return;
      }
    }
    if (stack.length) {
      stack[stack.length - 1].nodes.push(node);
    }
    if (node.hasChildNodes?.()) {
      for (const child of [...node.childNodes]) traverse(child);
    }
  }
  for (const child of [...root.childNodes]) traverse(child);
  return result;
}

exports.flattenDOMContents = flattenDOMContents;
exports.flattenLazyDOMContents = flattenLazyDOMContents;
//# sourceMappingURL=flat-dom-contents-C_R5gAYg.js.map
