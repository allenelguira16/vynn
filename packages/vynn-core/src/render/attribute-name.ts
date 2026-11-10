/**
 * Rejects attribute names that can alter HTML parsing or create inline
 * event-handler execution. JSX event handlers are installed as listeners,
 * never serialized as string attributes.
 */
export function assertSafeAttributeName(name: string): void {
  if (!/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(name)) {
    throw new TypeError("[Vynn] Invalid HTML/SVG attribute name: " + JSON.stringify(name));
  }

  if (/^on[a-z]/i.test(name)) {
    throw new TypeError(
      "[Vynn] Inline event-handler attributes are not supported. Use an event handler instead.",
    );
  }
}
