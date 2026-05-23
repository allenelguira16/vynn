import { AsyncLocalStorage } from "async_hooks";
function Fragment({ children }) {
  return children;
}
const isServer$1 = typeof window === "undefined";
let isServerStreaming = false;
const setIsServerStreaming = (newValue) => isServerStreaming = newValue;
const getCurrentStream = () => {
  return globalThis.__stream_context;
};
const clienStreamMap = /* @__PURE__ */ new Map();
const clientStreamContext = () => {
  let value;
  if (!isServer$1) {
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
  wrappedEffect.deps = [];
  wrappedEffect();
  return disposer;
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
const isNil = (value) => {
  return value === void 0 || value === null || value === false;
};
function hasNoHTMLTags(str) {
  const htmlTagRegex = /<[^>]+>/g;
  return !htmlTagRegex.test(str);
}
function getNodeString(jsxElement, skipWrappingTags2 = false) {
  if (isNil(jsxElement)) return null;
  if (typeof jsxElement === "string" || typeof jsxElement === "number") {
    let str = String(jsxElement);
    if (hasNoHTMLTags(str) && !skipWrappingTags2) {
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
let renderedNodes = [];
let currentIndex = 0;
function ssrDomWalker() {
  return {
    renderedNodes,
    get currentNode() {
      if (isServer$1) return void 0;
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
let lazyNodes = [];
const suspenseHandlerStack = [];
function getSuspenseHandler() {
  return suspenseHandlerStack[suspenseHandlerStack.length - 1];
}
function Suspense(props) {
  const { fallback = () => null, children } = props;
  if (isServerStreaming) return streamingSuspense(fallback, children);
  if (isServer$1) return fallback == null ? void 0 : fallback();
  const view = $state(children);
  const handler = (promise) => {
    suspenseHandlerStack.pop();
    queueMicrotask(() => {
      if (fallback) view.value = fallback;
    });
    promise.then(() => {
      view.value = children;
    });
  };
  if (!isServer$1 && window.__SSR_STREAMING_APP__) {
    view.value = children;
  } else {
    onDoneHydration$1(() => {
      view.value = children;
    });
  }
  return () => {
    suspenseHandlerStack.push(handler);
    return view.value;
  };
}
function onDoneHydration$1(fn) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }
  requestAnimationFrame(() => onDoneHydration$1(fn));
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
      stream.endIfDone();
    }).catch((err) => {
      if (err instanceof Promise) {
        stream.start();
        handler(err);
        return;
      }
      console.error("[vynn]: Suspense promise rejected:", err);
      stream.endIfDone();
    });
  };
  try {
    return normalizeToString(children);
  } catch (error) {
    if (error instanceof Promise) {
      stream.start();
      handler(error);
    }
    return [`<!--~$:${id}-->`, (fallback == null ? void 0 : fallback()) ?? "", `<!--/$:${id}-->`];
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
const createStateContext = (key) => {
  let instance;
  {
    instance = { states: [] };
  }
  return { ...instance, index: 0 };
};
function createLifeCycleContext(key) {
  const context = {
    mount: [],
    state: createStateContext(),
    effect: [],
    destroy: []
  };
  return context;
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
  onDoneHydration(() => {
    queueMicrotask(() => Promise.resolve().then(runMounts));
  });
}
function onDoneHydration(fn) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }
  requestAnimationFrame(() => onDoneHydration(fn));
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
const toArray = (item) => {
  return (Array.isArray(item) ? item : [item]).flat(Infinity);
};
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
function h$1(type, props = {}, children, key) {
  var _a;
  if (typeof type === "function") {
    return mountComponent(type, props, children);
  }
  if (type === "html") {
    return children;
  }
  xmlnsStack.push(((_a = props.xmlns) == null ? void 0 : _a.call(props)) ?? xmlnsStack[xmlnsStack.length - 1]);
  const element = createElement(type);
  const anchor = createTargetNode("base-anchor", true);
  element.appendChild(anchor);
  const cleanup = renderChildren$1(element, children, anchor);
  applyProps(element, props);
  queueMicrotask(() => {
    if (!element.parentNode) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNodes of mutation.removedNodes) {
          if (element.isSameNode(removedNodes)) {
            cleanup();
            anchor.remove();
            observer.disconnect();
          }
        }
      }
    });
    observer.observe(element.parentNode, { childList: true });
  });
  xmlnsStack.pop();
  return element;
}
const xmlnsStack = [];
function createElement(tag) {
  const { currentNode, next } = ssrDomWalker();
  if (currentNode instanceof Element && true) {
    if (currentNode.tagName.toLowerCase() !== tag) {
      console.error(
        "Hydration mismatch because the initial UI does not match what was rendered on the server"
      );
    }
    next();
    return currentNode;
  }
  const currentXmlns = xmlnsStack[xmlnsStack.length - 1];
  return currentXmlns ? document.createElementNS(currentXmlns, tag) : document.createElement(tag);
}
function mapArray(list, mapFn) {
  let items = [];
  return () => {
    var _a;
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
        (_a = item.element.parentNode) == null ? void 0 : _a.insertBefore(item.element, anchor);
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
      if (isServer$1) {
        const renderedItems = each().map((item, i) => children(item, { value: i }));
        return renderedItems;
      }
      return h$1(Loop, { each, children });
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
function onDestroy(fn) {
  const context = getRuntimeContext();
  if (!context) {
    throw new Error("onDestroy called outside of component");
  }
  context.destroy.push(fn);
}
function onMount(fn) {
  if (isServer$1) return;
  const context = getRuntimeContext();
  if (!context) {
    throw new Error("onMount called outside of component");
  }
  context.mount.push(fn);
}
function Portal({ children, target }) {
  let cleanup;
  onMount(() => {
    const mount = (target instanceof Function ? target() : target) ?? document.body;
    cleanup = renderChildren$1(mount, children);
  });
  onDestroy(() => {
    cleanup();
  });
  return () => null;
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
  const context = createLifeCycleContext();
  setRuntimeContext(context);
  const rootNode = createTargetNode("root");
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
  if (!isServer$1) {
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
function createTargetNode(name2, forceTextNode = false) {
  let targetNode;
  if (process.env.NODE_ENV === "development" && !forceTextNode) {
    targetNode = document.createComment(name2);
  } else {
    targetNode = document.createTextNode("");
  }
  rootNodes.add(targetNode);
  return targetNode;
}
function getNode(jsxElement) {
  if (jsxElement instanceof Node) {
    return jsxElement;
  }
  if (typeof jsxElement === "string" || typeof jsxElement === "number") {
    const { currentNode, next } = ssrDomWalker();
    if (currentNode instanceof Text && true) {
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
function renderChildren$1(parentNode, children, baseAnchor = null) {
  if (!isNil(baseAnchor) && !(baseAnchor == null ? void 0 : baseAnchor.parentNode)) return () => {
  };
  let renderDisposers = [];
  for (const _child of toArray(children)) {
    let subRenderDisposers = [];
    let nodeDisposers = [];
    const anchor = createTargetNode("anchor");
    parentNode.insertBefore(anchor, baseAnchor);
    const cleanup = () => {
      for (const dispose of subRenderDisposers) dispose == null ? void 0 : dispose();
      subRenderDisposers = [];
      for (const dispose of nodeDisposers) dispose();
      nodeDisposers = [];
    };
    const handler = getSuspenseHandler();
    const effectDisposer = $effect(() => {
      try {
        cleanup();
        const child = typeof _child === "function" ? _child() : _child;
        if (isNil(child)) {
          return;
        }
        if (typeof child === "function" || Array.isArray(child)) {
          const dispose = renderChildren$1(parentNode, child, anchor);
          subRenderDisposers.push(dispose);
          renderDisposers.push(dispose);
          return;
        }
        const node = getNode(child);
        parentNode.insertBefore(node, anchor);
        nodeDisposers.push(() => runComponentCleanup(node));
        nodeDisposers.push(() => parentNode.removeChild(node));
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      }
    });
    renderDisposers.push(() => cleanup());
    renderDisposers.push(() => anchor.remove());
    renderDisposers.push(effectDisposer);
  }
  return () => {
    for (const dispose of renderDisposers) {
      dispose();
    }
    renderDisposers = [];
  };
}
function memo(fn) {
  const wrapper = ((props) => {
    const memoStore = clientStreamContext().memo;
    let state = memoStore.get(wrapper);
    if (!state) {
      state = { lastProps: void 0, hasLast: false, lastResult: void 0 };
      memoStore.set(wrapper, state);
    }
    if (state.hasLast && isEqual(state.lastProps, props)) {
      return state.lastResult;
    }
    state.lastProps = props;
    state.lastResult = fn(props);
    state.hasLast = true;
    return state.lastResult;
  });
  return wrapper;
}
function isEqual(a, b) {
  if (a === b) return true;
  if (a !== a && b !== b) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object" && a.constructor === Object && b.constructor === Object) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!isEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}
const MARKER_START = "lazy";
const MARKER_END = "/lazy";
let isWarned = false;
const lazy = (_loader, namedExport = "default") => {
  if (!isWarned) {
    console.warn(`[vynn]: lazy() is still experimental so expect flickers`);
    isWarned = true;
  }
  const loader = _loader();
  const id = clientStreamContext().lazyID++;
  let component;
  let error;
  let promise = null;
  const getComponent = () => {
    if (component) return component;
    if (error) throw error;
    if (!isServerStreaming && ssrDomWalker().isHydrating && window.__SSR_STREAMING_APP__ && true) {
      const ssrDom = lazyNodes[id];
      setSsrDomWalker([...ssrDomWalker().renderedNodes, ...ssrDom]);
      promise = loader.then((modules) => {
        if (!(namedExport in modules)) {
          throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
        }
        component = modules[namedExport];
      });
      throw promise;
    }
    if (!promise) {
      promise = loader.then((modules) => {
        if (!(namedExport in modules)) {
          throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
        }
        component = modules[namedExport];
      }).catch((err) => {
        error = err instanceof Error ? err : new Error(String(err));
      });
    }
    throw promise;
  };
  return memo(() => {
    const Component2 = getComponent();
    const resolved = Component2();
    if (isServerStreaming) {
      return () => [
        `<!--${MARKER_START}:${id}-->`,
        resolved instanceof Function ? resolved() : resolved,
        `<!--${MARKER_END}:${id}-->`
      ];
    }
    globalThis.__lazy++;
    return resolved;
  });
};
const proxyMap = /* @__PURE__ */ new WeakMap();
function $store(initialObject) {
  function createReactiveObject(obj) {
    if (proxyMap.has(obj)) return proxyMap.get(obj);
    const proxy = new Proxy(obj, {
      get(target, key, receiver) {
        track(target, key);
        const result = Reflect.get(target, key, receiver);
        if (typeof result === "function") {
          return result.bind(receiver);
        }
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor == null ? void 0 : descriptor.get) {
          return descriptor.get.call(receiver);
        }
        if (typeof result === "object" && result !== null) {
          return createReactiveObject(result);
        }
        return result;
      },
      set(target, key, value, receiver) {
        const oldValue = target[key];
        const result = Reflect.set(target, key, value, receiver);
        if (oldValue !== value) {
          trigger(target, key);
        }
        return result;
      }
    });
    proxyMap.set(obj, proxy);
    return proxy;
  }
  return createReactiveObject(initialObject);
}
function resource(fetcher, _params) {
  const context = clientStreamContext();
  const id = context.resourceID++;
  const state = $store({
    loading: true,
    error: null,
    data: void 0,
    promiseStatus: "pending"
  });
  let promise = null;
  const refetch = () => {
    var _a;
    const params2 = _params.map((p) => p());
    untrack(() => {
      state.loading = true;
      state.error = null;
      state.data = void 0;
      state.promiseStatus = "pending";
    });
    if (!isServerStreaming && !isServer$1 && window.__resource && ((_a = window.__resource) == null ? void 0 : _a[id])) {
      untrack(() => {
        var _a2;
        state.data = (_a2 = window.__resource) == null ? void 0 : _a2[id];
        state.error = null;
        state.promiseStatus = "fulfilled";
        state.loading = false;
      });
      delete window.__resource[id];
      if (!window.__resource.length) {
        delete window.__resource;
      }
    } else {
      promise = untrack(() => fetcher(...params2));
      promise.then((result) => {
        untrack(() => {
          state.data = result;
          state.error = null;
          state.promiseStatus = "fulfilled";
          state.loading = false;
        });
        if (isServerStreaming) {
          const { controller, encoder } = getCurrentStream();
          controller.enqueue(
            encoder.encode(
              `<script>window.__resource ??= []; window.__resource[${id}] = ${JSON.stringify(result)};document.currentScript.remove();<\/script>`
            )
          );
        }
      }).catch((err) => {
        untrack(() => {
          state.data = void 0;
          state.error = err;
          state.promiseStatus = "rejected";
          state.loading = false;
        });
      });
    }
  };
  $effect(() => {
    refetch();
  });
  return {
    get loading() {
      return state.loading;
    },
    get error() {
      return state.error;
    },
    get data() {
      if (state.promiseStatus === "pending") throw promise;
      if (state.promiseStatus === "rejected") throw state.error;
      return state.data;
    },
    refetch,
    mutate(newValue) {
      state.data = newValue;
    }
  };
}
const map = /* @__PURE__ */ new WeakMap();
function createContext() {
  const id = Symbol("context");
  function Provider(props) {
    map.set(id, props.value);
    return props.children();
  }
  function getContext() {
    const value = map.get(id);
    if (!value) {
      throw new Error("No provider found for context.");
    }
    return value;
  }
  return [Provider, getContext];
}
function $computed(getter) {
  const result = $state();
  $effect(() => {
    result.value = getter();
  });
  return {
    get value() {
      return result.value;
    }
  };
}
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
    const context = createLifeCycleContext();
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
  if (isServer$1) {
    return h(type, props, children);
  }
  return h$1(type, props, children);
};
const isServer = typeof window === "undefined";
const $location = $store({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : ""
});
if (!isServer) {
  window.addEventListener("popstate", () => {
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  });
}
function navigate(path) {
  if (path === $location.pathname) return;
  if (!isServer) {
    history.pushState(null, "", path);
    $location.pathname = path;
    $location.search = window.location.search;
  } else {
    $location.pathname = path;
  }
}
function isActiveRoute(path, exact = true) {
  const current = $location.pathname;
  const currentParts = current.split("/").filter(Boolean);
  const targetParts = path.split("/").filter(Boolean);
  if (exact && currentParts.length !== targetParts.length) return false;
  if (!exact && currentParts.length < targetParts.length) return false;
  return targetParts.every((part, i) => {
    return part.startsWith(":") || part === currentParts[i];
  });
}
function matchRoute(path, routes2, basePath = "") {
  const fullPath = (prefix, sub) => (prefix + "/" + sub).replace(/\/+/g, "/");
  const pathSegments = path.split("/").filter(Boolean);
  for (const route of routes2) {
    const fullRoutePath = fullPath(basePath, route.path);
    const routeSegments = fullRoutePath.split("/").filter(Boolean);
    const params2 = {};
    let matched = true;
    for (let i = 0; i < routeSegments.length; i++) {
      const routePart = routeSegments[i];
      const pathPart = pathSegments[i];
      if (routePart == null ? void 0 : routePart.startsWith("*")) {
        const key = routePart.slice(1) || "wildcard";
        params2[key] = pathSegments.slice(i).join("/");
        return {
          chain: [route],
          params: params2
        };
      }
      if (routePart == null ? void 0 : routePart.startsWith(":")) {
        if (!pathPart) {
          matched = false;
          break;
        }
        params2[routePart.slice(1)] = pathPart;
      } else if (routePart !== pathPart) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (route.children) {
      const childMatch = matchRoute(path, route.children, fullRoutePath);
      if (childMatch) {
        return {
          chain: [route, ...childMatch.chain],
          params: {
            ...params2,
            ...childMatch.params
          }
        };
      }
    }
    if (routeSegments.length === pathSegments.length) {
      return {
        chain: [route],
        params: params2
      };
    }
  }
  const star = routes2.find((r) => r.path.startsWith("*"));
  if (star) {
    const key = star.path.slice(1) || "wildcard";
    return {
      chain: [star],
      params: {
        [key]: pathSegments.join("/")
      }
    };
  }
  return void 0;
}
const params = $store({});
function Router({
  url,
  routes: routes2
}) {
  if (url) $location.pathname = url;
  return () => {
    console.log("changed");
    const matched = matchRoute($location.pathname, routes2);
    if (matched) {
      const {
        chain,
        params: extractedParams
      } = matched;
      for (const key in params) delete params[key];
      Object.assign(params, extractedParams);
      return buildComponentTree(chain);
    }
    for (const key in params) delete params[key];
    return () => /* @__PURE__ */ jsx(Fragment, {});
  };
}
const [OutletProvider, outletContext] = createContext();
function Outlet() {
  const Child = outletContext();
  return () => /* @__PURE__ */ jsx(Child, {});
}
function buildComponentTree(chain) {
  let Component2 = () => null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const route = chain[i];
    const Comp = route.component;
    const child = Component2;
    Component2 = () => /* @__PURE__ */ jsx(OutletProvider, {
      value: () => child,
      children: () => /* @__PURE__ */ jsx(Comp, {})
    });
  }
  return () => /* @__PURE__ */ jsx(Component2, {});
}
const Template = ({
  title,
  children
}) => {
  return () => /* @__PURE__ */ jsx("div", {
    class: () => "p-2 w-full",
    children: () => [() => /* @__PURE__ */ jsx("h1", {
      class: () => "font-bold text-2xl mb-2",
      children: () => title
    }), () => children()]
  });
};
const ButtonPageList = () => {
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Pages",
    children: () => /* @__PURE__ */ jsx("ul", {
      class: () => "flex flex-col gap-2",
      children: () => [() => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/"),
          disabled: () => isActiveRoute("/"),
          children: () => "All"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/lazy"),
          disabled: () => isActiveRoute("/lazy"),
          children: () => "Lazy"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/forms"),
          disabled: () => isActiveRoute("/forms"),
          children: () => "Forms"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/contexts"),
          disabled: () => isActiveRoute("/contexts"),
          children: () => "Contexts"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/dropdown-list"),
          disabled: () => isActiveRoute("/dropdown-list"),
          children: () => "Dropdown Lists"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/non-async-suspense"),
          disabled: () => isActiveRoute("/non-async-suspense"),
          children: () => "Non Async Suspense"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/stacked-suspense"),
          disabled: () => isActiveRoute("/stacked-suspense"),
          children: () => "Stacked Suspense"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/poke-dex"),
          disabled: () => isActiveRoute("/poke-dex"),
          children: () => "PokeDex List"
        })
      }), () => /* @__PURE__ */ jsx("li", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => navigate("/poke-dex-suspense"),
          disabled: () => isActiveRoute("/poke-dex-suspense"),
          children: () => "PokeDex List with Suspense"
        })
      })]
    })
  });
};
function Contexts() {
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Contexts",
    children: () => [() => /* @__PURE__ */ jsx(Form, {
      children: () => /* @__PURE__ */ jsx(Input$1, {})
    }), () => /* @__PURE__ */ jsx(Form, {
      children: () => /* @__PURE__ */ jsx(Wrapper, {
        children: () => /* @__PURE__ */ jsx(Input$1, {})
      })
    })]
  });
}
const [FormProvider, formContext] = createContext();
function Form({
  children
}) {
  const state = $store({
    name: "asd"
  });
  return () => /* @__PURE__ */ jsx(FormProvider, {
    value: () => state,
    children: () => children()
  });
}
function Wrapper({
  children
}) {
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => [() => /* @__PURE__ */ jsx("div", {
      children: () => "Hi"
    }), () => " ", () => children()]
  });
}
function Input$1() {
  const forms = formContext();
  const i = $state(0);
  const cleanup = setInterval(() => {
    i.value++;
  }, 1e3);
  onDestroy(() => {
    clearInterval(cleanup);
  });
  const nameEl = () => /* @__PURE__ */ jsx("div", {
    children: () => [() => "Name: ", () => forms.name, () => " Hi"]
  });
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => [() => /* @__PURE__ */ jsx("div", {
      children: () => [() => "Name: ", () => forms.name]
    }), () => nameEl, () => /* @__PURE__ */ jsx("input", {
      type: () => "text",
      name: () => "name",
      onInput: () => (event) => forms.name = event.currentTarget.value,
      placeholder: () => "name",
      autoComplete: () => "off",
      value: () => forms.name
    }), " ", () => i.value]
  });
}
const name = $store({
  firstName: "First name",
  lastName: "Last name"
});
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const Dropdowns = () => {
  const dropdownStore = $store({
    showDropdown: true,
    sortDirection: "asc",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8],
    handleSort() {
      this.numbers = [...this.numbers].sort((a, b) => {
        return this.sortDirection === "desc" ? a - b : b - a;
      });
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    },
    handleRandomize() {
      const result = [...this.numbers];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      this.numbers = result;
    },
    addDropdown() {
      let currentNumbers = [...this.numbers];
      if (currentNumbers.length >= 8) return;
      currentNumbers = currentNumbers.sort((a, b) => a - b);
      if (!currentNumbers.length) {
        this.numbers = [1];
      } else {
        this.numbers = [...currentNumbers, currentNumbers[currentNumbers.length - 1] + 1];
      }
    },
    removeDropdown() {
      if (this.numbers.length > 0) {
        this.numbers = this.numbers.slice(0, -1);
      }
    }
  });
  onMount(async () => {
    console.log("Dropdowns onMount");
  });
  onDestroy(async () => {
    console.log("Dropdowns onDestroy");
  });
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Dropdown List",
    children: () => /* @__PURE__ */ jsx("div", {
      class: () => "flex flex-col gap-4",
      children: () => [() => /* @__PURE__ */ jsx("div", {
        children: () => /* @__PURE__ */ jsx("div", {
          class: () => "flex gap-2 items-center",
          children: () => [() => /* @__PURE__ */ jsx("span", {
            children: () => "Add Dropdown"
          }), () => /* @__PURE__ */ jsx("button", {
            class: () => "btn",
            onClick: () => dropdownStore.addDropdown,
            children: () => "+"
          }), () => /* @__PURE__ */ jsx("button", {
            class: () => "btn",
            onClick: () => dropdownStore.removeDropdown,
            children: () => "-"
          })]
        })
      }), () => /* @__PURE__ */ jsx("div", {
        class: () => "flex gap-2 items-center",
        children: () => [() => /* @__PURE__ */ jsx("span", {
          children: () => "Sort"
        }), () => /* @__PURE__ */ jsx("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleSort,
          children: () => dropdownStore.sortDirection === "asc" ? "↑" : "↓"
        }), () => /* @__PURE__ */ jsx("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleRandomize,
          children: () => "Randomize"
        })]
      }), () => /* @__PURE__ */ jsx("div", {
        children: () => /* @__PURE__ */ jsx("button", {
          onClick: () => () => dropdownStore.showDropdown = !dropdownStore.showDropdown,
          children: () => "Unmount Dropdown List"
        })
      }), () => dropdownStore.showDropdown && /* @__PURE__ */ jsx(DropdownList, {
        dropdowns: () => dropdownStore
      }), () => /* @__PURE__ */ jsx("div", {
        children: () => "Hi"
      })]
    })
  });
};
const DropdownList = ({
  dropdowns
}) => {
  console.log("rerender");
  onMount(async () => {
    console.log("DropdownList onMount");
  });
  onDestroy(async () => {
    console.log("DropdownList onDestroy");
  });
  return () => /* @__PURE__ */ jsx("div", {
    class: () => "flex gap-2 flex-col lg:flex-row",
    children: () => loop(() => dropdowns.numbers).each((number) => /* @__PURE__ */ jsx(Dropdown, {
      number: () => number
    }))
  });
};
const Dropdown = ({
  number
}) => {
  console.log("rerender");
  const isOpen = $state(false);
  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => /* @__PURE__ */ jsx("div", {
      class: () => "relative lg:w-[calc(100%/8)]",
      children: () => [() => /* @__PURE__ */ jsx("div", {
        children: () => [() => /* @__PURE__ */ jsx("button", {
          class: () => "btn w-full",
          onClick: () => handleToggle,
          children: () => [() => "Open Dropdown ", () => number]
        }), () => /* @__PURE__ */ jsx("div", {
          class: () => "break-all",
          children: () => [() => "Hi ", () => name.firstName]
        })]
      }), () => isOpen.value && /* @__PURE__ */ jsx("div", {
        class: () => "absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10",
        children: () => /* @__PURE__ */ jsx("ul", {
          children: () => Array.from({
            length: 3
          }).map((_, i) => i + 1).map((item) => /* @__PURE__ */ jsx("li", {
            class: () => "cursor-pointer p-2 rounded hover:bg-gray-100",
            children: () => [() => "Dropdown ", () => item]
          }))
        })
      })]
    })
  });
};
const Forms = () => {
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Forms",
    children: () => /* @__PURE__ */ jsx("div", {
      children: () => [() => /* @__PURE__ */ jsx("div", {
        children: () => [() => /* @__PURE__ */ jsx("label", {
          class: () => "break-all",
          for: () => "name-input2",
          children: () => [() => "Hi ", () => name.firstName]
        }), () => /* @__PURE__ */ jsx("div", {
          children: () => /* @__PURE__ */ jsx("input", {
            type: () => "text",
            value: () => name.firstName,
            id: () => "name-input2"
          })
        })]
      }), () => /* @__PURE__ */ jsx("div", {
        children: () => [() => /* @__PURE__ */ jsx(Counter, {}), () => /* @__PURE__ */ jsx(Input, {})]
      })]
    })
  });
};
function Counter() {
  const count = $state(0);
  const double = $computed(() => count.value * 2);
  const handleCount = () => {
    count.value++;
  };
  $effect(() => {
  });
  $effect(() => {
  });
  onDestroy(() => {
    console.log("bye");
  });
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => [() => count.value, () => /* @__PURE__ */ jsx("div", {
      children: () => [() => "Count: ", () => count.value]
    }), () => /* @__PURE__ */ jsx("div", {
      children: () => [() => "Double Count: ", () => double.value]
    }), () => /* @__PURE__ */ jsx("button", {
      disabled: () => count.value >= 5,
      onClick: () => handleCount,
      children: () => "Add counter"
    }), () => /* @__PURE__ */ jsx("div", {
      children: () => count.value <= 3 ? /* @__PURE__ */ jsx("div", {
        children: () => "Hi"
      }) : "string"
    })]
  });
}
function Input() {
  return () => /* @__PURE__ */ jsx("div", {
    children: () => [() => /* @__PURE__ */ jsx("label", {
      class: () => "break-all",
      for: () => "name-input",
      children: () => [() => "Name ", () => name.firstName, () => " ", () => /* @__PURE__ */ jsx("span", {
        children: () => "Hi"
      })]
    }), () => /* @__PURE__ */ jsx("div", {
      children: () => /* @__PURE__ */ jsx("input", {
        id: () => "name-input",
        type: () => "text",
        onInput: () => (event) => {
          name.firstName = event.currentTarget.value;
        },
        value: () => name.firstName
      })
    })]
  });
}
const LazyImport = lazy(() => import("./assets/LazyImport-emZMJJE9.js"), "LazyImport");
const LazyTest = lazy(() => import("./assets/Test-z0RnTgN-.js"), "Test");
const Lazy = () => {
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Lazy",
    children: () => /* @__PURE__ */ jsx("div", {
      children: () => [() => /* @__PURE__ */ jsx(Suspense, {
        fallback: () => "Tester",
        children: () => /* @__PURE__ */ jsx(LazyImport, {})
      }), () => /* @__PURE__ */ jsx(Suspense, {
        children: () => /* @__PURE__ */ jsx(LazyTest, {})
      }), () => /* @__PURE__ */ jsx("h1", {
        children: () => "Test"
      })]
    })
  });
};
function NonAsyncSuspense() {
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Non-Async Suspense",
    children: () => /* @__PURE__ */ jsx("div", {
      children: () => /* @__PURE__ */ jsx(Suspense, {
        fallback: () => /* @__PURE__ */ jsx("div", {
          children: () => "hi"
        }),
        children: () => /* @__PURE__ */ jsx("div", {
          children: () => "Children"
        })
      })
    })
  });
}
const PokeDex = () => {
  const pokeDex = $store({
    isLoading: true,
    pokeDexList: [],
    prevLink: "",
    nextLink: "",
    sortDirection: "asc",
    async fetchData(url, controller) {
      var _a, _b;
      if (!url) return;
      this.isLoading = true;
      const response = await fetch(url, {
        signal: controller == null ? void 0 : controller.signal
      });
      const json = await response.json();
      await sleep(0);
      this.pokeDexList = json.results;
      this.prevLink = ((_a = json.previous) == null ? void 0 : _a.replace(/limit=\d+/, "limit=20")) ?? "";
      this.nextLink = ((_b = json.next) == null ? void 0 : _b.replace(/limit=\d+/, "limit=20")) ?? "";
      this.isLoading = false;
    },
    handleSort(key) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
      this.pokeDexList = [...this.pokeDexList].sort((a, b) => {
        const cmp = a[key].localeCompare(b[key]);
        return this.sortDirection === "asc" ? cmp : -cmp;
      });
    }
  });
  onMount(async () => {
    const controller = new AbortController();
    await pokeDex.fetchData("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20", controller);
    return () => {
      console.log("Cleaning up PokeDex component");
      controller.abort();
    };
  });
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.handleSort(key);
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "PokeDex List",
    children: () => [() => /* @__PURE__ */ jsx("div", {
      class: () => "break-all",
      children: () => [() => "Hi ", () => name.firstName]
    }), () => /* @__PURE__ */ jsx("table", {
      class: () => "w-full mx-auto my-2 table-fixed",
      children: () => [() => /* @__PURE__ */ jsx("thead", {
        children: () => /* @__PURE__ */ jsx("tr", {
          children: () => [() => /* @__PURE__ */ jsx("th", {
            class: () => "w-1/3",
            children: () => "ID"
          }), () => /* @__PURE__ */ jsx("th", {
            onClick: () => sortOnClick("name"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "Name"
          }), () => /* @__PURE__ */ jsx("th", {
            onClick: () => sortOnClick("url"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "URL"
          })]
        })
      }), () => /* @__PURE__ */ jsx("tbody", {
        children: () => [() => pokeDex.isLoading && /* @__PURE__ */ jsx(Fragment, {
          children: () => loop(() => Array.from({
            length: 20
          }).map((_, i) => i + 1)).each((number) => /* @__PURE__ */ jsx("tr", {
            children: () => /* @__PURE__ */ jsx("td", {
              colSpan: () => 3,
              class: () => "h-[24px] text-center",
              children: () => number === 10 && "loading..."
            })
          }))
        }), () => !pokeDex.isLoading && /* @__PURE__ */ jsx(Fragment, {
          children: () => loop(() => pokeDex.pokeDexList).each(({
            name: name2,
            url
          }, index) => /* @__PURE__ */ jsx("tr", {
            children: () => [() => /* @__PURE__ */ jsx("td", {
              class: () => "w-1/3 text-center",
              children: () => index.value + 1
            }), () => /* @__PURE__ */ jsx("td", {
              class: () => "w-1/3 text-center truncate",
              children: () => name2
            }), () => /* @__PURE__ */ jsx("td", {
              class: () => "w-1/3 text-center truncate",
              onClick: () => showUrlOnClick(url),
              children: () => url
            })]
          }))
        })]
      })]
    }), () => /* @__PURE__ */ jsx("div", {
      class: () => "flex gap-4 justify-center",
      children: () => [() => /* @__PURE__ */ jsx("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.prevLink),
        disabled: () => pokeDex.isLoading || !pokeDex.prevLink,
        children: () => "Previous"
      }), () => /* @__PURE__ */ jsx("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.nextLink),
        disabled: () => pokeDex.isLoading || !pokeDex.nextLink,
        children: () => "Next"
      })]
    })]
  });
};
const PokeDexSuspense = () => {
  const pokeDex = $store({
    url: "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
    sortDirection: "asc",
    sort(key) {
      if (!pokeDexResource.data) return;
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
      pokeDexResource.mutate({
        ...pokeDexResource.data,
        results: [...pokeDexResource.data.results].sort((a, b) => {
          const cmp = a[key].localeCompare(b[key]);
          return this.sortDirection === "asc" ? cmp : -cmp;
        })
      });
    },
    changeUrl(newUrl) {
      if (pokeDexResource.loading || !newUrl) return;
      this.url = newUrl.replace(/limit=\d+/, "limit=20");
    }
  });
  const pokeDexResource = resource(async (url) => {
    const response = await fetch(url);
    const json = await response.json();
    return json;
  }, [() => pokeDex.url]);
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.sort(key);
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "PokeDex List (via Suspense)",
    children: () => /* @__PURE__ */ jsx("div", {
      children: () => [() => /* @__PURE__ */ jsx("div", {
        class: () => "break-all",
        children: () => [() => "Hi ", () => name.firstName]
      }), () => /* @__PURE__ */ jsx("table", {
        class: () => "w-full mx-auto my-2 table-fixed",
        children: () => [() => /* @__PURE__ */ jsx("thead", {
          children: () => /* @__PURE__ */ jsx("tr", {
            children: () => [() => /* @__PURE__ */ jsx("th", {
              class: () => "w-1/3",
              children: () => "ID"
            }), () => /* @__PURE__ */ jsx("th", {
              onClick: () => sortOnClick("name"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "Name"
            }), () => /* @__PURE__ */ jsx("th", {
              onClick: () => sortOnClick("url"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "URL"
            })]
          })
        }), () => /* @__PURE__ */ jsx("tbody", {
          children: () => /* @__PURE__ */ jsx(Suspense, {
            fallback: () => /* @__PURE__ */ jsx(Fragment, {
              children: () => Array.from({
                length: 20
              }).map((_, i) => i + 1).map((number) => /* @__PURE__ */ jsx("tr", {
                children: () => /* @__PURE__ */ jsx("td", {
                  colSpan: () => 3,
                  class: () => "h-[24px] text-center",
                  children: () => number === 10 && "loading..."
                })
              }))
            }),
            children: () => /* @__PURE__ */ jsx(Fragment, {
              children: () => pokeDexResource.data.results.map(({
                name: name2,
                url
              }, index) => /* @__PURE__ */ jsx("tr", {
                children: () => [() => /* @__PURE__ */ jsx("td", {
                  class: () => "w-1/3 text-center",
                  children: () => index + 1
                }), () => /* @__PURE__ */ jsx("td", {
                  class: () => "w-1/3 text-center truncate",
                  children: () => name2
                }), () => /* @__PURE__ */ jsx("td", {
                  class: () => "w-1/3 text-center truncate",
                  onClick: () => showUrlOnClick(url),
                  children: () => url
                })]
              }))
            })
          })
        })]
      }), () => /* @__PURE__ */ jsx("div", {
        class: () => "flex gap-4 justify-center",
        children: () => [() => /* @__PURE__ */ jsx("button", {
          class: () => "btn",
          onClick: () => () => {
            var _a;
            return pokeDex.changeUrl((_a = pokeDexResource.data) == null ? void 0 : _a.previous);
          },
          disabled: () => {
            var _a;
            return pokeDexResource.loading || !((_a = pokeDexResource.data) == null ? void 0 : _a.previous);
          },
          children: () => "Previous"
        }), () => /* @__PURE__ */ jsx("button", {
          class: () => "btn",
          onClick: () => () => {
            var _a;
            return pokeDex.changeUrl((_a = pokeDexResource.data) == null ? void 0 : _a.next);
          },
          disabled: () => {
            var _a;
            return pokeDexResource.loading || !((_a = pokeDexResource.data) == null ? void 0 : _a.next);
          },
          children: () => "Next"
        })]
      })]
    })
  });
};
const StackedSuspense = memo(() => {
  const msg3 = $store({
    data: ""
  });
  const msg2 = resource(async () => {
    console.log("called");
    await sleep(200);
    return "hello world 2";
  }, []);
  return () => /* @__PURE__ */ jsx(Template, {
    title: () => "Stacked Suspense",
    children: () => /* @__PURE__ */ jsx("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => !msg2.loading && /* @__PURE__ */ jsx("input", {
        onInput: () => (event) => {
          msg2.mutate(event.currentTarget.value.toString());
        },
        value: () => msg2.data
      }), () => /* @__PURE__ */ jsx(Suspense, {
        children: () => msg3.data
      }), () => /* @__PURE__ */ jsx(Suspense, {
        fallback: () => /* @__PURE__ */ jsx("div", {
          children: () => "loading 1..."
        }),
        children: () => [() => /* @__PURE__ */ jsx(Component, {}), () => /* @__PURE__ */ jsx(Suspense, {
          fallback: () => /* @__PURE__ */ jsx("div", {
            children: () => "loading 2..."
          }),
          children: () => msg2.data
        })]
      })]
    })
  });
});
const Component = memo(() => {
  const msg = resource(async () => {
    await sleep(100);
    return `hello world`;
  }, []);
  return () => /* @__PURE__ */ jsx("div", {
    children: () => msg.data
  });
});
const routes = [{
  path: "/",
  component: () => {
    console.log("layout rerender");
    return () => /* @__PURE__ */ jsx("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ jsx(ButtonPageList, {}), () => /* @__PURE__ */ jsx(Outlet, {})]
    });
  },
  children: [{
    path: "/",
    component: () => /* @__PURE__ */ jsx(Fragment, {
      children: () => [() => /* @__PURE__ */ jsx(Lazy, {}), () => /* @__PURE__ */ jsx(Forms, {}), () => /* @__PURE__ */ jsx(Contexts, {}), () => /* @__PURE__ */ jsx(Dropdowns, {}), () => /* @__PURE__ */ jsx(NonAsyncSuspense, {}), () => /* @__PURE__ */ jsx(StackedSuspense, {}), () => /* @__PURE__ */ jsx(PokeDex, {}), () => /* @__PURE__ */ jsx(PokeDexSuspense, {})]
    })
  }, {
    path: "/lazy",
    component: Lazy
  }, {
    path: "/contexts",
    component: Contexts
  }, {
    path: "/stacked-suspense",
    component: StackedSuspense
  }, {
    path: "/poke-dex",
    component: PokeDex
  }, {
    path: "/poke-dex-suspense",
    component: PokeDexSuspense
  }, {
    path: "/dropdown-list",
    component: Dropdowns
  }, {
    path: "/forms",
    component: Forms
  }, {
    path: "/non-async-suspense",
    component: NonAsyncSuspense
  }]
}];
const App = ({
  url
}) => {
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => /* @__PURE__ */ jsx(Router, {
      url: () => url,
      routes: () => routes
    })
  });
};
function renderToStream(App2) {
  setIsServerStreaming(true);
  const als = new AsyncLocalStorage();
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let pending = 0;
      globalThis.__stream_context = {
        encoder,
        controller,
        start: () => pending++,
        endIfDone: () => {
          pending--;
          if (pending < 0) controller.close();
        }
      };
      als.run(globalThis.__stream_context, () => {
        const store = als.getStore();
        globalThis.__stream_context = store;
        try {
          const html = h(App2, {});
          controller.enqueue(encoder.encode(html));
          queueMicrotask(() => globalThis.__stream_context.endIfDone());
        } catch (err) {
          console.error("renderToStream error:", err);
        }
      });
    }
  });
  return stream;
}
const render = (url) => {
  return renderToStream(() => /* @__PURE__ */ jsx(App, {
    url: () => url
  }));
};
export {
  $effect as $,
  Fragment as F,
  Suspense as S,
  $state as a,
  createContext as c,
  jsx as j,
  lazy as l,
  onMount as o,
  render
};
