import { m as toArray, n as isNil, p as getNodeString, r as resolveComponentProps, q as createLifeCycleContext, v as normalizeToString, w as setRuntimeContext, e as isServer, x as h$1 } from './portal-DgOOIBzp.js';

function stringifyProps(props) {
  const transformedProps = [];
  for (const key in props) {
    if (key.startsWith("on") && typeof props[key] === "function") {
      continue;
    }
    const value = typeof props[key] === "function" ? props[key]() : props[key];
    if (key === "ref") {
      continue;
    }
    if (key === "style") {
      continue;
    }
    if (key === "html") {
      continue;
    }
    if (typeof value === "boolean") {
      if (value) transformedProps.push(key);
      continue;
    }
    transformedProps.push(`${key}="${value}"`);
  }
  if (transformedProps.length > 0) transformedProps.unshift("");
  return transformedProps.join(" ");
}

const skipWrappingTags = /* @__PURE__ */ new Set(["title", "meta", "script", "style"]);
function renderChildren(parent, children) {
  function renderRecursive(value) {
    const transformedChildren = [];
    const resolvedChildren = value instanceof Function ? value() : value;
    const children2 = toArray(resolvedChildren);
    for (const child of children2) {
      if (isNil(child)) continue;
      if (typeof child === "function") {
        const resolved = renderRecursive(child);
        if (!isNil(resolved)) transformedChildren.push(resolved);
      } else {
        const resolved = getNodeString(child, skipWrappingTags.has(parent));
        if (!isNil(resolved)) transformedChildren.push(resolved);
      }
    }
    return transformedChildren.join("") || null;
  }
  return renderRecursive(children);
}

const voidElements = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function h(type, props = {}, children, _key) {
  if (typeof type === "function") {
    resolveComponentProps(type, props);
    const key = _key ? _key().toString() + type.toString() : void 0;
    const context = createLifeCycleContext(key);
    setRuntimeContext(context);
    try {
      const resolved2 = normalizeToString(type({ ...props, children }));
      return resolved2 || void 0;
    } finally {
      setRuntimeContext(null);
      context.destroy.forEach((cleanup) => cleanup());
    }
  }
  if (voidElements.has(type)) {
    return `<${type}${stringifyProps(props)}>`;
  }
  const resolved = renderChildren(type, "html" in props ? props["html"] : children) || "";
  return `<${type}${stringifyProps(props)}>${resolved}</${type}>`;
}

const jsx = (type, { children, ...props } = {}, key) => {
  if (isServer) {
    return h(type, props, children, key);
  }
  return h$1(type, props, children, key);
};

export { h, jsx as j };
//# sourceMappingURL=jsx-runtime-Dv4F1Mn_.js.map
