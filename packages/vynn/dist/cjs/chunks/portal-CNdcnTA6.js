'use strict';

const stateMap = /* @__PURE__ */ new Map();
const createStateContext = (key) => {
  let instance;
  if (key !== void 0) {
    if (!stateMap.has(key)) {
      stateMap.set(key, { states: [] });
    }
    instance = stateMap.get(key);
  } else {
    instance = { states: [] };
  }
  return { ...instance, index: 0 };
};

let runtimeContext = null;
function setRuntimeContext(ctx) {
  runtimeContext = ctx;
}
function getRuntimeContext() {
  return runtimeContext;
}

let activeEffect = null;
function setActiveEffect(newActiveEffect) {
  activeEffect = newActiveEffect;
}
let lastDisposer = null;
const effectQueue = /* @__PURE__ */ new Set();
let isFlushing = false;
function scheduleEffect(effect) {
  effectQueue.add(effect);
  if (!isFlushing) {
    isFlushing = true;
    queueMicrotask(() => {
      for (const effect2 of effectQueue) {
        effect2();
      }
      effectQueue.clear();
      isFlushing = false;
    });
  }
}
function $effect(fn) {
  const context = getRuntimeContext();
  const wrappedEffect = async () => {
    removeEffect(wrappedEffect);
    if (wrappedEffect.cleanup) {
      wrappedEffect.cleanup();
      wrappedEffect.cleanup = void 0;
    }
    const previousEffect = activeEffect;
    activeEffect = wrappedEffect;
    if (context) context.effect.push(wrappedEffect);
    try {
      const result = fn();
      if (typeof result === "function") {
        wrappedEffect.cleanup = result;
      } else if (result instanceof Promise) {
        const cleanup = await result;
        if (typeof cleanup === "function") {
          wrappedEffect.cleanup = cleanup;
        }
      }
    } finally {
      activeEffect = previousEffect;
    }
  };
  const disposer = () => removeEffect(wrappedEffect);
  lastDisposer = disposer;
  wrappedEffect.deps = [];
  wrappedEffect();
  return disposer;
}
function stopEffect() {
  if (lastDisposer) {
    lastDisposer();
    lastDisposer = null;
  }
}
function removeEffect(effect) {
  if (effect.deps) {
    for (const depSet of effect.deps) {
      depSet.delete(effect);
    }
    effect.deps.length = 0;
  }
  if (effect.cleanup) {
    effect.cleanup();
    effect.cleanup = void 0;
  }
}

const targetToPropertyEffectsMap = /* @__PURE__ */ new WeakMap();
function track(target, key) {
  if (!activeEffect) return;
  let propertyEffectsMap = targetToPropertyEffectsMap.get(target);
  if (!propertyEffectsMap) {
    propertyEffectsMap = /* @__PURE__ */ new Map();
    targetToPropertyEffectsMap.set(target, propertyEffectsMap);
  }
  let effects = propertyEffectsMap.get(key);
  if (!effects) {
    effects = /* @__PURE__ */ new Set();
    propertyEffectsMap.set(key, effects);
  }
  if (!effects.has(activeEffect)) {
    effects.add(activeEffect);
    if (activeEffect.deps) {
      activeEffect.deps.push(effects);
    } else {
      activeEffect.deps = [effects];
    }
  }
}
function trigger(target, key) {
  const propertyEffectsMap = targetToPropertyEffectsMap.get(target);
  if (!propertyEffectsMap) return;
  const effects = propertyEffectsMap.get(key);
  if (!effects) return;
  for (const effect of effects) {
    scheduleEffect(effect);
  }
}

function $state(initialValue) {
  const context = getRuntimeContext();
  if (context && context.state) {
    const { states, index } = context.state;
    if (states.length <= index) {
      const s = createState(initialValue);
      states.push(s);
    }
    return states[context.state.index++];
  }
  return createState(initialValue);
}
function createState(initialValue) {
  const state = { value: initialValue };
  return new Proxy(state, {
    get(target, key, receiver) {
      track(target, key);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, newValue, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, newValue, receiver);
      if (oldValue !== newValue) {
        trigger(target, key);
      }
      return result;
    }
  });
}

function untrack(fn) {
  const prevEffect = activeEffect;
  setActiveEffect(null);
  try {
    return fn();
  } finally {
    setActiveEffect(prevEffect);
  }
}

const eventRegistry = /* @__PURE__ */ new WeakMap();
function addEventListener(element, type, listener) {
  let handlers = eventRegistry.get(element);
  if (!handlers) {
    handlers = /* @__PURE__ */ new Map();
    eventRegistry.set(element, handlers);
  }
  if (handlers.has(type)) {
    element.removeEventListener(type, handlers.get(type));
  }
  element.addEventListener(type, listener);
  handlers.set(type, listener);
}
function removeEventListener(element, type) {
  const handlers = eventRegistry.get(element);
  if (!handlers) return;
  const listener = handlers.get(type);
  if (listener) {
    element.removeEventListener(type, listener);
    handlers.delete(type);
  }
  if (handlers.size === 0) {
    eventRegistry.delete(element);
  }
}

function applyProps(element, props) {
  for (const key in props) {
    const startEffect = () => {
      if (ssrDomWalker().isHydrating) {
        requestAnimationFrame(startEffect);
        return;
      }
      $effect(() => {
        const raw = props[key];
        const value = typeof raw === "function" && key !== "ref" ? raw() : raw;
        if (key.startsWith("on") && element instanceof HTMLElement) {
          const type = key.slice(2).toLowerCase();
          addEventListener(element, type, value);
          return () => removeEventListener(element, type);
        }
        const isFormControl = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
        if (key === "value" && isFormControl && typeof props["onInput"] !== "function" && typeof props["onChange"] !== "function") {
          element.value = value;
          const revert = () => {
            if (element.value !== value) {
              element.value = value;
            }
          };
          element.setAttribute(key, value);
          element.addEventListener("input", revert);
          return () => element.removeEventListener("input", revert);
        }
        if (key === "ref" && typeof value === "function") {
          value(element);
          return;
        }
        if (key === "style" && typeof value === "object" && element instanceof HTMLElement) {
          applyStyle(element, value);
          return;
        }
        if (typeof value === "boolean") {
          element.toggleAttribute(key, value);
          return;
        }
        if (key === "html" && typeof value === "string") {
          element.innerHTML = value;
          return;
        }
        element.setAttribute(key, value);
      });
    };
    startEffect();
  }
}
function isUnitlessProp(prop) {
  return CSS.supports(prop, "0") && !CSS.supports(prop, "0px");
}
function applyStyle(element, style) {
  if (!(element instanceof HTMLElement)) return;
  for (const key in style) {
    if (!Object.hasOwn(style, key)) continue;
    const value = style[key];
    if (value == null) continue;
    if (key === "length" || key === "parentRule") continue;
    const isNumeric = typeof value === "number";
    const needsUnit = isNumeric && !isUnitlessProp(key);
    element.style[key] = isNumeric ? needsUnit ? `${value}px` : `${value}` : String(value);
  }
}

const cleanupMap = /* @__PURE__ */ new Map();
function setComponentCleanup(node, cleanups) {
  cleanupMap.set(node, cleanups);
}
function runComponentCleanup(node) {
  const cleanups = cleanupMap.get(node);
  if (cleanups) {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanupMap.delete(node);
  }
  if (node instanceof HTMLElement) {
    for (const child of node.childNodes) {
      runComponentCleanup(child);
    }
  }
}

function createLifeCycleContext(key) {
  const context = {
    // id: window.crypto.randomUUID(),
    mount: [],
    state: createStateContext(key),
    effect: [],
    destroy: []
  };
  return context;
}

function onDestroy(fn) {
  const context = getRuntimeContext();
  if (!context) {
    throw new Error("onDestroy called outside of component");
  }
  context.destroy.push(fn);
}

function onMount(fn) {
  if (isServer) return;
  const context = getRuntimeContext();
  if (!context) {
    throw new Error("onMount called outside of component");
  }
  context.mount.push(fn);
}

function runLifecycle(rootNode, context) {
  if (!context) return;
  const cleanups = [];
  setComponentCleanup(rootNode, cleanups);
  const runMounts = async () => {
    for (const mountFn of context.mount) {
      const cleanup = await mountFn();
      if (cleanup) cleanups.push(cleanup);
    }
    for (const destroyFn of context.destroy) {
      cleanups.push(destroyFn);
    }
    for (const effectFn of context.effect) {
      cleanups.push(() => Promise.resolve(removeEffect(effectFn)));
    }
  };
  onDoneHydration$1(() => {
    queueMicrotask(() => Promise.resolve().then(runMounts));
  });
}
function onDoneHydration$1(fn) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }
  requestAnimationFrame(() => onDoneHydration$1(fn));
}

function getNode(jsxElement) {
  if (jsxElement instanceof Node) {
    return jsxElement;
  }
  if (typeof jsxElement === "string" || typeof jsxElement === "number") {
    const { currentNode, next } = ssrDomWalker();
    if (currentNode instanceof Text && !exports.IS_LOG_JSX) {
      if (currentNode.textContent !== String(jsxElement)) {
        throw new Error(
          "Hydration mismatch because the initial UI does not match what was rendered on the server"
        );
      }
      next();
      return currentNode;
    }
    return document.createTextNode(String(jsxElement));
  }
  throw new Error(`Unknown value: ${jsxElement}`);
}

function renderChildren(parentNode, children) {
  const cleanups = [];
  function renderRecursive(value, anchor) {
    let nodes = [];
    let disposers = [];
    const cleanup = () => {
      for (const node of nodes) {
        runComponentCleanup(node);
        if (node.parentNode === parentNode) {
          parentNode.removeChild(node);
        }
      }
      for (const dispose2 of disposers) dispose2();
      nodes = [];
      disposers = [];
    };
    const handler = getSuspenseHandler();
    const disposer = $effect(() => {
      try {
        cleanup();
        const resolvedChildren = value instanceof Function ? value() : value;
        const children2 = toArray(resolvedChildren);
        for (const child of children2) {
          if (isNil(child)) continue;
          if (typeof child === "function") {
            const childAnchor = createTargetNode(`anchor`);
            parentNode.insertBefore(childAnchor, anchor);
            const childDisposer = renderRecursive(child, childAnchor);
            disposers.push(childDisposer);
            nodes.push(childAnchor);
          } else {
            const node = getNode(child);
            parentNode.insertBefore(node, anchor);
            nodes.push(node);
          }
        }
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      }
    });
    return () => {
      disposer();
      cleanup();
    };
  }
  const dispose = renderRecursive(children, null);
  cleanups.push(dispose);
  return () => {
    for (const c of cleanups) c();
  };
}

const IGNORE_COMPONENT = [Suspense, Loop, Portal];
function resolveComponentProps(type, props = {}) {
  if (IGNORE_COMPONENT.includes(type)) return;
  for (const key in props) {
    props[key] = props[key] instanceof Function ? props[key]() : props[key];
  }
}

const rootNodes = /* @__PURE__ */ new WeakSet();
function mountComponent(type, props, children, _key) {
  resolveComponentProps(type, props);
  const key = _key ? _key().toString() + type.toString() : void 0;
  const context = createLifeCycleContext(key);
  setRuntimeContext(context);
  const rootNode = document.createTextNode("");
  const value = untrack(
    () => children ? type({ ...props, children }) : type(props)
  );
  const jsxElements = toArray([rootNode, value]).flat();
  setRuntimeContext(null);
  runLifecycle(rootNode, context);
  rootNodes.add(rootNode);
  return jsxElements;
}
queueMicrotask(() => {
  if (!isServer) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNodes of mutation.removedNodes) {
          runComponentCleanup(removedNodes);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
});

function h(type, props = {}, children, key) {
  if (typeof type === "function") {
    return mountComponent(type, props, children, key);
  }
  if (type === "html") {
    return children;
  }
  xmlnsStack.push(props.xmlns?.() ?? xmlnsStack[xmlnsStack.length - 1]);
  const element = createElement(type);
  renderChildren(element, children);
  applyProps(element, props);
  xmlnsStack.pop();
  return element;
}
const xmlnsStack = [];
function createElement(tag) {
  const { currentNode, next } = ssrDomWalker();
  if (currentNode instanceof Element && !exports.IS_LOG_JSX) {
    console.log(currentNode, tag);
    if (currentNode.tagName.toLowerCase() !== tag) {
      throw new Error(
        "Hydration mismatch because the initial UI does not match what was rendered on the server"
      );
    }
    next();
    return currentNode;
  }
  const currentXmlns = xmlnsStack[xmlnsStack.length - 1];
  return currentXmlns ? document.createElementNS(currentXmlns, tag) : document.createElement(tag);
}

function hasNoHTMLTags(str) {
  const htmlTagRegex = /<[^>]+>/g;
  return !htmlTagRegex.test(str);
}
function getNodeString(jsxElement, skipWrappingTags = false) {
  if (isNil(jsxElement)) return null;
  if (typeof jsxElement === "string" || typeof jsxElement === "number") {
    let str = String(jsxElement);
    if (hasNoHTMLTags(str) && !skipWrappingTags) {
      str = `<!--!-->${str}<!--/-->`;
    }
    return str;
  }
  throw new Error(`Unknown value: ${jsxElement}`);
}

function normalizeToString(value) {
  if (isNil(value)) return null;
  if (typeof value === "function") {
    return normalizeToString(value());
  }
  if (Array.isArray(value)) {
    return value.map(normalizeToString).join("") || null;
  }
  return getNodeString(value);
}

function createTargetNode(name, forceTextNode = false) {
  let targetNode;
  if (process.env.NODE_ENV === "development" && !forceTextNode) {
    targetNode = document.createComment(name);
  } else {
    targetNode = document.createTextNode("");
  }
  rootNodes.add(targetNode);
  return targetNode;
}

const isNil = (value) => {
  return value === void 0 || value === null || value === false;
};

function createApp(App) {
  let cleanup;
  return {
    mount: (id) => {
      let node;
      if (id instanceof HTMLElement || id instanceof DocumentFragment) {
        node = id;
      } else if (id instanceof Document) {
        node = id.documentElement;
      } else {
        node = document.querySelector(id);
      }
      if (node instanceof HTMLElement || node instanceof DocumentFragment) {
        const app = mountComponent(App);
        cleanup = renderChildren(node, app);
      } else {
        throw new Error("Node must be of type Element");
      }
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    }
  };
}

exports.IS_LOG_JSX = false;
function logJsx(nodes) {
  try {
    exports.IS_LOG_JSX = true;
    if (isServer) return nodes;
    const fragment = document.createDocumentFragment();
    createApp(() => nodes).mount(fragment);
    const newNodes = [...Array.from(fragment.childNodes).filter((node) => !rootNodes.has(node))];
    return newNodes.length === 1 ? newNodes[0] : newNodes;
  } finally {
    exports.IS_LOG_JSX = false;
  }
}

const isServer = typeof window === "undefined";
exports.isServerStreaming = false;
const setIsServerStreaming = (newValue) => exports.isServerStreaming = newValue;

let renderedNodes = [];
let currentIndex = 0;
function ssrDomWalker() {
  return {
    renderedNodes,
    get currentNode() {
      if (isServer) return void 0;
      return renderedNodes[currentIndex];
    },
    get isHydrating() {
      return !!renderedNodes[currentIndex];
    },
    next: () => {
      if (renderedNodes[currentIndex]) currentIndex++;
    },
    prev: () => {
      if (renderedNodes[currentIndex]) currentIndex--;
    }
  };
}
function setSsrDomWalker(node, index) {
  renderedNodes = node;
}
exports.lazyNodes = [];
function setLazyDom(node) {
  exports.lazyNodes = node;
}

const toArray = (item) => {
  return (Array.isArray(item) ? item : [item]).flat(Infinity);
};
const flattenArray = (items) => {
  return items.flat(Infinity);
};

const getCurrentStream = () => {
  globalThis.__stream_context ??= {};
  return globalThis.__stream_context;
};
const clienStreamMap = /* @__PURE__ */ new Map();
const clientStreamContext = () => {
  let value;
  if (!isServer) {
    if (!clienStreamMap.has(window))
      clienStreamMap.set(window, {
        suspenseID: 0,
        resourceID: 0,
        lazyID: 0,
        stateID: 0,
        memo: /* @__PURE__ */ new Map()
      });
    value = clienStreamMap.get(window);
  } else {
    const context = getCurrentStream();
    if (!clienStreamMap.has(context))
      clienStreamMap.set(context, {
        suspenseID: 0,
        resourceID: 0,
        lazyID: 0,
        stateID: 0,
        memo: /* @__PURE__ */ new Map()
      });
    value = clienStreamMap.get(context);
  }
  if (!value) throw new Error("[vynn]: context does not exists");
  return value;
};

const suspenseHandlerStack = [];
function getSuspenseHandler() {
  return suspenseHandlerStack[suspenseHandlerStack.length - 1];
}
function Suspense(props) {
  const { fallback: _fallback = () => null, children: _children } = props;
  const children = () => _children();
  const fallback = () => _fallback();
  if (exports.isServerStreaming) return streamingSuspense(fallback, children);
  if (isServer) return fallback?.();
  const view = $state(fallback);
  const handler = (promise) => {
    suspenseHandlerStack.pop();
    queueMicrotask(() => {
      if (fallback) view.value = !("__fromLazy" in promise) ? fallback : () => null;
    });
    promise.then(() => {
      withSuspenseRender(children);
    });
  };
  const withSuspenseRender = (newView) => {
    suspenseHandlerStack.push(handler);
    try {
      view.value = newView;
    } catch (error) {
      if (error instanceof Promise) {
        handler(error);
      } else {
        throw error;
      }
    }
  };
  if (!isServer && window.__SSR_STREAMING_APP__) {
    withSuspenseRender(children);
  } else {
    onDoneHydration(() => {
      withSuspenseRender(children);
    });
  }
  return () => view.value;
}
function onDoneHydration(fn) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }
  requestAnimationFrame(() => onDoneHydration(fn));
}
function streamingSuspense(fallback, children) {
  const context = clientStreamContext();
  const id = context.suspenseID++;
  const stream = getCurrentStream();
  const handler = (promise) => {
    promise.then(() => {
      const html = normalizeToString(children);
      const template = `<template async-id="${id}">${html}</template>`;
      const script = `<script>__hydrateAsync("${id}");document.currentScript.remove();<\/script>`;
      stream.controller.enqueue(stream.encoder.encode(template));
      stream.controller.enqueue(stream.encoder.encode(script));
      stream.end();
      stream.tryClose();
    }).catch((err) => {
      if (err instanceof Promise) {
        handler(err);
        return;
      }
      console.error("[vynn]: Suspense promise rejected:", err);
      stream.end();
      stream.tryClose();
    });
  };
  try {
    return normalizeToString(children);
  } catch (error) {
    if (error instanceof Promise) {
      stream.start();
      handler(error);
    }
    return [`<!--~$:${id}-->`, fallback?.() ?? "", `<!--/$:${id}-->`];
  }
}

function Fragment({ children }) {
  return children;
}

const jsx = (type, { children, ...props } = {}, key) => {
  return h(type, props, children, key);
};

function mapArray(list, mapFn) {
  let items = [];
  return () => {
    const arr = list() || [];
    const len = arr.length;
    const newItems = new Array(len);
    const oldIndexMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < items.length; i++) {
      const key = items[i].value;
      if (!oldIndexMap.has(key)) oldIndexMap.set(key, []);
      oldIndexMap.get(key).push(i);
    }
    const newToOld = new Array(len).fill(-1);
    for (let i = 0; i < len; i++) {
      const value = arr[i];
      const oldIndices = oldIndexMap.get(value);
      if (oldIndices && oldIndices.length) {
        const oldIndex = oldIndices.shift();
        newToOld[i] = oldIndex;
        newItems[i] = items[oldIndex];
      } else {
        const idxState = $state(i);
        const element = mapFn(value, idxState);
        newItems[i] = { value, index: idxState, element };
      }
    }
    const seq = longestIncreasingSubsequence(newToOld);
    let seqIdx = seq.length - 1;
    for (let i = len - 1; i >= 0; i--) {
      const item = newItems[i];
      if (newToOld[i] === -1 || i !== seq[seqIdx]) {
        const anchor = i + 1 < len ? newItems[i + 1].element : null;
        item.element.parentNode?.insertBefore(item.element, anchor);
      } else {
        seqIdx--;
      }
      item.index.value = i;
    }
    items = newItems;
    return items.map((it) => it.element);
  };
}
function longestIncreasingSubsequence(arr) {
  const p = arr.slice();
  const result = [];
  let u, v;
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (n < 0) continue;
    if (result.length === 0 || arr[result[result.length - 1]] < n) {
      p[i] = result.length > 0 ? result[result.length - 1] : -1;
      result.push(i);
      continue;
    }
    u = 0;
    v = result.length - 1;
    while (u < v) {
      const c = (u + v) / 2 | 0;
      if (arr[result[c]] < n) u = c + 1;
      else v = c;
    }
    if (n < arr[result[u]]) {
      if (u > 0) p[i] = result[u - 1];
      result[u] = i;
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}

function loop(items) {
  return {
    each(children) {
      const each = items;
      children = children;
      if (isServer) {
        const renderedItems = each().map((item, i) => children(item, { value: i }));
        return renderedItems;
      }
      return jsx(Loop, { each, children });
    }
  };
}
function Loop({
  each,
  children
}) {
  const result = $state([]);
  const handler = getSuspenseHandler();
  const listFn = mapArray(each, children);
  $effect(() => {
    try {
      result.value = listFn();
    } catch (err) {
      if (err instanceof Promise && handler) {
        handler(err);
      } else {
        throw err;
      }
    }
  });
  return () => result.value;
}

function Portal({ children, target }) {
  let cleanup;
  onMount(() => {
    const mount = (target instanceof Function ? target() : target) ?? document.body;
    cleanup = renderChildren(mount, children);
  });
  onDestroy(() => {
    cleanup();
  });
  return () => null;
}

exports.$effect = $effect;
exports.$state = $state;
exports.Fragment = Fragment;
exports.Portal = Portal;
exports.Suspense = Suspense;
exports.clientStreamContext = clientStreamContext;
exports.createApp = createApp;
exports.createLifeCycleContext = createLifeCycleContext;
exports.flattenArray = flattenArray;
exports.getCurrentStream = getCurrentStream;
exports.getNodeString = getNodeString;
exports.h = h;
exports.isNil = isNil;
exports.isServer = isServer;
exports.jsx = jsx;
exports.logJsx = logJsx;
exports.loop = loop;
exports.mountComponent = mountComponent;
exports.normalizeToString = normalizeToString;
exports.onDestroy = onDestroy;
exports.onMount = onMount;
exports.renderChildren = renderChildren;
exports.resolveComponentProps = resolveComponentProps;
exports.setIsServerStreaming = setIsServerStreaming;
exports.setLazyDom = setLazyDom;
exports.setRuntimeContext = setRuntimeContext;
exports.setSsrDomWalker = setSsrDomWalker;
exports.ssrDomWalker = ssrDomWalker;
exports.stopEffect = stopEffect;
exports.toArray = toArray;
exports.track = track;
exports.trigger = trigger;
exports.untrack = untrack;
//# sourceMappingURL=portal-CNdcnTA6.js.map
