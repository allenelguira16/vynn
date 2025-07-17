'use strict';

var jsxRuntime = require('./portal-CjD0DGPe.js');

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
    const children2 = jsxRuntime.toArray(resolvedChildren);
    for (const child of children2) {
      if (jsxRuntime.isNil(child)) continue;
      if (typeof child === "function") {
        const resolved = renderRecursive(child);
        if (!jsxRuntime.isNil(resolved)) transformedChildren.push(resolved);
      } else {
        const resolved = jsxRuntime.getNodeString(child, skipWrappingTags.has(parent));
        if (!jsxRuntime.isNil(resolved)) transformedChildren.push(resolved);
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
    jsxRuntime.resolveComponentProps(type, props);
    const key = _key ? _key().toString() + type.toString() : void 0;
    const context = jsxRuntime.createLifeCycleContext(key);
    jsxRuntime.setRuntimeContext(context);
    try {
      const resolved2 = jsxRuntime.normalizeToString(type({ ...props, children }));
      return resolved2 || void 0;
    } finally {
      jsxRuntime.setRuntimeContext(null);
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
  if (jsxRuntime.isServer) {
    return h(type, props, children, key);
  }
  return jsxRuntime.h(type, props, children, key);
};

exports.h = h;
exports.jsx = jsx;
//# sourceMappingURL=jsx-runtime-BPJxIPVT.js.map
