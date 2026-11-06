/**
 * Development diagnostics for recovering from server/client DOM mismatches.
 *
 * These helpers stay internal to the renderer. Hydration remains best-effort:
 * compatible nodes are reused, incompatible nodes are replaced, and text
 * nodes are synchronized to the client render.
 */

const claimedHydrationElements = new WeakSet<Element>();

function warnHydrationMismatch(
  kind: "element" | "text" | "attribute",
  expected: string,
  actual: string,
  node?: Node,
): void {
  console.warn(
    `[Vynn] Hydration mismatch: expected ${kind} ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    node,
  );
}

/**
 * Checks whether a claimed SSR element can be reused for the client template.
 * Incompatible server elements are detached so the normal insertion path can
 * place the newly-created client element in their position.
 */
export function isHydrationElementCompatible(
  node: Element | undefined,
  expectedTag: string,
  expectedNamespace: string,
): node is Element {
  if (!node) {
    warnHydrationMismatch("element", `<${expectedTag}>`, "no server-rendered element");
    return false;
  }

  if (node.localName !== expectedTag.toLowerCase() || node.namespaceURI !== expectedNamespace) {
    const actual = `<${node.localName}> in namespace ${JSON.stringify(node.namespaceURI)}`;
    const expected = `<${expectedTag}> in namespace ${JSON.stringify(expectedNamespace)}`;

    warnHydrationMismatch("element", expected, actual, node);
    node.parentNode?.removeChild(node);
    return false;
  }

  claimedHydrationElements.add(node);
  return true;
}

/**
 * Reports an attribute difference before the normal reactive attribute effect
 * applies the client value.
 */
export function diagnoseHydrationAttribute(
  element: Element,
  name: string,
  expectedValue: string | null,
): void {
  if (!claimedHydrationElements.has(element)) return;

  const actualValue = element.getAttribute(name);

  if (actualValue !== expectedValue) {
    warnHydrationMismatch(
      "attribute",
      `${name}=${JSON.stringify(expectedValue)}`,
      `${name}=${JSON.stringify(actualValue)}`,
      element,
    );
  }
}

/**
 * Checks and repairs a claimed text node. Text differences are recoverable
 * without replacing the node, so existing references and DOM position survive.
 */
export function synchronizeHydrationText(
  node: Text | undefined,
  expectedText: string,
): node is Text {
  if (!node) {
    warnHydrationMismatch("text", expectedText, "no server-rendered text node");
    return false;
  }

  if (node.data !== expectedText) {
    warnHydrationMismatch("text", expectedText, node.data, node);
    node.data = expectedText;
  }

  return true;
}
