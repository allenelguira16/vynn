'use strict';

var fragment = require('./chunks/Bp5SZ2VF.js');
var logJsx = require('./chunks/BMPDAHvm.js');
var flatDomContents = require('./chunks/ChMd1pbg.js');

function memo(fn) {
  const wrapper = ((props) => {
    const memoStore = logJsx.clientStreamContext().memo;
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
const lazy = (_loader, namedExport = "default") => {
  const loader = _loader();
  const id = logJsx.clientStreamContext().lazyID++;
  let component;
  let error;
  let promise = null;
  const getComponent = () => {
    if (component) return component;
    if (error) throw error;
    if (!logJsx.isServerStreaming() && logJsx.ssrDomWalker().isHydrating && window.__SSR_STREAMING_APP__ && !logJsx.IS_LOG_JSX) {
      const lazyNode = logJsx.lazyNodes[id];
      logJsx.setSsrDomWalker([.../* @__PURE__ */ new Set([...logJsx.ssrDomWalker().renderedNodes, ...lazyNode])]);
      promise = loader.then((modules) => {
        if (!(namedExport in modules)) {
          throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
        }
        component = modules[namedExport];
      });
      throw Object.assign(promise, { __fromLazy: true });
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
    const Component = getComponent();
    const resolved = Component();
    if (logJsx.isServerStreaming()) {
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

function NoHydration({ children }) {
  if (logJsx.isServer && children)
    return () => ["<!--no-hydration-->", children(), "<!--end-no-hydration-->"];
  const { currentNode, next } = logJsx.ssrDomWalker();
  if (!currentNode) {
    return () => null;
  }
  const start = previousCommentSibling(currentNode);
  const nodes = getNextSiblingsUntilEndNoHydration(start);
  const frag = document.createDocumentFragment();
  nodes.forEach((node) => frag.append(node));
  flatDomContents.flattenDOMContents(frag).forEach(() => next());
  const end = findEndNoHydration(start);
  start.remove();
  end?.remove();
  return () => nodes;
}
function getNextSiblingsUntilEndNoHydration(node) {
  const result = [];
  let next = node.nextSibling;
  while (next) {
    if (next.nodeType === Node.COMMENT_NODE && next.nodeValue?.trim() === "end-no-hydration") {
      break;
    }
    if (next.nodeType === Node.ELEMENT_NODE) {
      result.push(next);
    }
    next = next.nextSibling;
  }
  return result;
}
function previousCommentSibling(node) {
  let prev = node.previousSibling;
  while (prev) {
    if (prev.nodeType === Node.COMMENT_NODE && prev.nodeValue?.trim() === "no-hydration") {
      return prev;
    }
    prev = prev.previousSibling;
  }
  return null;
}
function findEndNoHydration(start) {
  let next = start.nextSibling;
  while (next) {
    if (next.nodeType === Node.COMMENT_NODE && next.nodeValue?.trim() === "end-no-hydration") {
      return next;
    }
    next = next.nextSibling;
  }
  return null;
}

const proxyMap = /* @__PURE__ */ new WeakMap();
function $store(initialObject) {
  function createReactiveObject(obj) {
    if (proxyMap.has(obj)) return proxyMap.get(obj);
    const proxy = new Proxy(obj, {
      get(target, key, receiver) {
        logJsx.track(target, key);
        const result = Reflect.get(target, key, receiver);
        if (typeof result === "function") {
          return result.bind(receiver);
        }
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor?.get) {
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
          logJsx.trigger(target, key);
        }
        return result;
      }
    });
    proxyMap.set(obj, proxy);
    return proxy;
  }
  return createReactiveObject(initialObject);
}

function resource(fetcher, _params, isPreload = true) {
  const stream = logJsx.getCurrentStream();
  const context = logJsx.clientStreamContext();
  const id = context.resourceID++;
  const state = $store({
    loading: true,
    error: null,
    data: void 0,
    promiseStatus: "pending"
  });
  let promise = null;
  const refetch = () => {
    const params = _params.map((p) => p());
    logJsx.untrack(() => {
      state.loading = true;
      state.error = null;
      state.data = void 0;
      state.promiseStatus = "pending";
    });
    if (!logJsx.isServerStreaming() && !logJsx.isServer && window.__resource && window.__resource?.[id] && isPreload) {
      logJsx.untrack(() => {
        state.data = window.__resource?.[id];
        state.error = null;
        state.promiseStatus = "fulfilled";
        state.loading = false;
      });
      delete window.__resource[id];
      if (!window.__resource.length) {
        delete window.__resource;
      }
    } else {
      promise = logJsx.untrack(() => fetcher(...params));
      promise.then((result) => {
        logJsx.untrack(() => {
          state.data = result;
          state.error = null;
          state.promiseStatus = "fulfilled";
          state.loading = false;
        });
        if (logJsx.isServerStreaming() && isPreload) {
          stream.controller.enqueue(
            stream.encoder.encode(
              `<script>window.__resource ??= []; window.__resource[${id}] = ${JSON.stringify(result)};document.currentScript.remove();<\/script>`
            )
          );
        }
      }).catch((err) => {
        logJsx.untrack(() => {
          state.data = void 0;
          state.error = err;
          state.promiseStatus = "rejected";
          state.loading = false;
        });
      });
    }
  };
  logJsx.$effect(() => {
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

function createContext() {
  let value;
  function Provider(props) {
    value = props.value;
    return props.children;
  }
  function getContext() {
    if (!value) {
      throw new Error("No provider found for context.");
    }
    return value;
  }
  return [Provider, getContext];
}

function $computed(getter) {
  const result = logJsx.$state();
  logJsx.$effect(() => {
    result.value = getter();
  });
  return {
    get value() {
      return result.value;
    }
  };
}

function unwrap(value) {
  function deepUnwrap(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (typeof obj === "function") return obj;
    const result = {};
    for (const key of Reflect.ownKeys(obj)) {
      const value2 = obj[key];
      result[key] = deepUnwrap(value2);
    }
    return result;
  }
  return deepUnwrap(value);
}

exports.Fragment = fragment.Fragment;
exports.$effect = logJsx.$effect;
exports.$state = logJsx.$state;
exports.Portal = logJsx.Portal;
exports.Suspense = logJsx.Suspense;
exports.loop = logJsx.loop;
exports.onDestroy = logJsx.onDestroy;
exports.onMount = logJsx.onMount;
exports.$computed = $computed;
exports.$store = $store;
exports.NoHydration = NoHydration;
exports.createContext = createContext;
exports.lazy = lazy;
exports.memo = memo;
exports.resource = resource;
exports.unwrap = unwrap;
//# sourceMappingURL=index.js.map
