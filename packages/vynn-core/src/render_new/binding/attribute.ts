import { $renderEffect } from "../../reactivity/effect";
import { runWithScope } from "../lifecycle/scope";
import type { Accessor, Disposable, RenderScope } from "../types";

/**
 * A namespaced attribute name.
 *
 * `qualifiedName` is passed to setAttributeNS(); `localName` is passed to
 * removeAttributeNS()/getAttributeNS(). When omitted, localName is derived
 * from the part after the optional namespace prefix.
 */
export interface NamespacedAttributeName {
  readonly namespaceURI: string;
  readonly qualifiedName: string;
  readonly localName?: string;
}

/** An ordinary attribute name or an explicit namespaced attribute name. */
export type AttributeName = string | NamespacedAttributeName;

/** A reactive attribute binding owned by a render scope. */
export interface AttributeBinding extends Disposable {
  readonly element: Element;
  readonly name: AttributeName;
}

interface NormalizedAttributeName {
  readonly namespaceURI: string | null;
  readonly qualifiedName: string;
  readonly localName: string;
  readonly publicName: AttributeName;
}

function assertElement(element: Element): void {
  if (
    !element ||
    typeof element !== "object" ||
    element.nodeType !== 1 ||
    typeof element.getAttribute !== "function" ||
    typeof element.setAttribute !== "function" ||
    typeof element.removeAttribute !== "function"
  ) {
    throw new TypeError("[vynn]: bindAttribute() expects a DOM Element.");
  }
}

function normalizeAttributeName(name: AttributeName): NormalizedAttributeName {
  if (typeof name === "string") {
    if (name.length === 0 || name.trim() !== name) {
      throw new TypeError(
        "[vynn]: bindAttribute() expects a non-empty attribute name.",
      );
    }

    return {
      namespaceURI: null,
      qualifiedName: name,
      localName: name,
      publicName: name,
    };
  }

  if (!name || typeof name !== "object") {
    throw new TypeError("[vynn]: bindAttribute() expects an attribute name.");
  }

  const { namespaceURI, qualifiedName } = name;

  if (
    typeof namespaceURI !== "string" ||
    namespaceURI.length === 0 ||
    typeof qualifiedName !== "string" ||
    qualifiedName.length === 0 ||
    qualifiedName.trim() !== qualifiedName
  ) {
    throw new TypeError(
      "[vynn]: bindAttribute() received an invalid namespaced attribute name.",
    );
  }

  const separator = qualifiedName.indexOf(":");
  const inferredLocalName =
    separator === -1 ? qualifiedName : qualifiedName.slice(separator + 1);
  const localName = name.localName ?? inferredLocalName;

  if (
    (separator === 0 ||
      separator === qualifiedName.length - 1 ||
      (separator !== -1 && qualifiedName.indexOf(":", separator + 1) !== -1)) ||
    typeof localName !== "string" ||
    localName.length === 0 ||
    localName !== inferredLocalName
  ) {
    throw new TypeError(
      "[vynn]: bindAttribute() received an invalid namespaced attribute name.",
    );
  }

  return {
    namespaceURI,
    qualifiedName,
    localName,
    // Copy the descriptor so later caller mutations cannot change this binding.
    publicName: Object.freeze({ namespaceURI, qualifiedName, localName }),
  };
}

function toAttributeValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function writeAttribute(
  element: Element,
  name: NormalizedAttributeName,
  value: string | null,
): void {
  if (name.namespaceURI === null) {
    const current = element.getAttribute(name.qualifiedName);

    if (value === null) {
      if (current !== null) {
        element.removeAttribute(name.qualifiedName);
      }
    } else if (current !== value) {
      element.setAttribute(name.qualifiedName, value);
    }

    return;
  }

  if (
    typeof element.getAttributeNS !== "function" ||
    typeof element.setAttributeNS !== "function" ||
    typeof element.removeAttributeNS !== "function"
  ) {
    throw new TypeError(
      "[vynn]: bindAttribute() requires namespace-aware DOM attribute methods.",
    );
  }

  const current = element.getAttributeNS(
    name.namespaceURI,
    name.localName,
  );

  if (value === null) {
    if (current !== null) {
      element.removeAttributeNS(name.namespaceURI, name.localName);
    }
  } else if (current !== value) {
    element.setAttributeNS(name.namespaceURI, name.qualifiedName, value);
  }
}

/**
 * Binds an element attribute to a reactive accessor.
 *
 * The initial value is applied synchronously. Subsequent updates use Vynn's
 * render-priority effect and run after derived computations but before
 * ordinary effects. The effect belongs to the supplied render scope.
 *
 * null and undefined remove the attribute. All other values use String(),
 * matching the DOM setAttribute() conversion semantics. Boolean HTML
 * properties such as disabled should be handled by a property binding rather
 * than relying on attribute coercion here.
 *
 * Namespaced attributes (for example SVG xlink:href) must pass an explicit
 * { namespaceURI, qualifiedName } descriptor.
 */
export function bindAttribute(
  scope: RenderScope,
  element: Element,
  name: AttributeName,
  read: Accessor<unknown>,
): AttributeBinding {
  assertElement(element);

  if (typeof read !== "function") {
    throw new TypeError("[vynn]: bindAttribute() expects a value accessor.");
  }

  const normalizedName = normalizeAttributeName(name);

  if (
    normalizedName.namespaceURI !== null &&
    (typeof element.getAttributeNS !== "function" ||
      typeof element.setAttributeNS !== "function" ||
      typeof element.removeAttributeNS !== "function")
  ) {
    throw new TypeError(
      "[vynn]: bindAttribute() requires namespace-aware DOM attribute methods.",
    );
  }

  const stop = runWithScope(scope, () =>
    $renderEffect(() => {
      writeAttribute(element, normalizedName, toAttributeValue(read()));
    }),
  );

  return Object.freeze({
    element,
    name: normalizedName.publicName,
    dispose: stop,
  });
}
