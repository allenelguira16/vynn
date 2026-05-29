const skipWrappingTags = new Set(["title", "meta", "script", "style"]);

/**
 * Flatten dom elements of an element, used in hydration walking
 *
 * @param root root element
 * @returns flatten dom elements
 */
export function flattenDOMContents(root: Node) {
  // const doms: Node[] = [];
  // let capture = false;
  // let bufferEmpty = false;

  // function flattenNode(node: Node) {
  //   if (node instanceof Comment) {
  //     const comment = node.data.trim();

  //     if (comment === "!") {
  //       capture = true;
  //       bufferEmpty = true;
  //       node.remove();
  //     } else if (comment === "/") {
  //       capture = false;
  //       if (bufferEmpty) {
  //         const text = document.createTextNode("");
  //         node.parentNode?.insertBefore(text, node.nextSibling);
  //         doms.push(text);
  //         bufferEmpty = false;
  //       }
  //       node.remove();
  //     }

  //     return;
  //   }

  //   if (node instanceof HTMLElement) {
  //     doms.push(node);

  //     if (skipWrappingTags.has(node.tagName.toLowerCase())) {
  //       for (const child of [...node.childNodes]) {
  //         if (child instanceof Text) doms.push(child);
  //         else flattenNode(child);
  //       }
  //       return;
  //     }
  //   } else if (capture && node instanceof Text) {
  //     doms.push(node);
  //     bufferEmpty = false;
  //   }

  //   for (const child of [...node.childNodes]) {
  //     flattenNode(child);
  //   }
  // }

  // for (const child of [...root.childNodes]) {
  //   flattenNode(child);
  // }

  // return doms;
  const doms: Node[] = [];

  function flattenNode(node: Node) {
    if (node instanceof HTMLElement) {
      doms.push(node);

      if (skipWrappingTags.has(node.tagName.toLowerCase())) {
        for (const child of [...node.childNodes]) {
          if (child instanceof Text) doms.push(child);
          else flattenNode(child);
        }
        return;
      }
    } else if (node instanceof Text) {
      doms.push(node);
    } else if (node instanceof Comment && node.textContent === "empty") {
      const empty = document.createTextNode("");
      node.replaceWith(empty);
      doms.push(empty);
    } else {
      // console.log(node);
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

export function flattenLazyDOMContents(root: ParentNode = document): Node[][] {
  const START_RE = /^lazy:(\d+)$/;
  const END_RE = /^\/lazy:(\d+)$/;

  type Frame = { id: number; nodes: Node[] };
  const result: Node[][] = [];
  const stack: Frame[] = [];

  function traverse(node: Node) {
    if (node instanceof Comment) {
      const txt = node.data.trim();

      const start = txt.match(START_RE);
      if (start) {
        // open a frame for this lazy block
        stack.push({ id: +start[1], nodes: [] });
        // node.remove();
        return; // skip the start marker
      }

      const end = txt.match(END_RE);
      if (end) {
        const top = stack.pop();
        if (top && top.id === +end[1]) {
          // place the nodes array at its numeric index
          result[top.id] = top.nodes;
        }
        // node.remove();
        return; // skip the end marker
      }
    }

    // collect nodes only for the current open block
    if (stack.length) {
      if (!(node instanceof Comment && node.textContent === "split")) {
        stack[stack.length - 1].nodes.push(node);
      }
    }

    // recurse through children
    if (node.hasChildNodes?.()) {
      for (const child of [...node.childNodes]) traverse(child);
    }
  }

  for (const child of [...root.childNodes]) traverse(child);

  return result;
}
