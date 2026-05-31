import { AsyncLocalStorage } from "async_hooks";
function r({ children: n }) {
  return n;
}
const k$1 = () => globalThis.__stream_context, I = /* @__PURE__ */ new Map(), de = { suspenseID: 0, resourceID: 0, lazyID: 0, stateID: 0, memo: /* @__PURE__ */ new Map() }, _ = () => {
  const e = k$1();
  I.has(e) || I.set(e, de);
  const t = I.get(e);
  if (!t) throw new Error("[vynn]: GlobalContext does not exists");
  return t;
}, me = () => {
  const e = _();
  e.memo.clear(), e.lazyID = 0, e.resourceID = 0, e.stateID = 0, e.suspenseID = 0;
}, h$1 = typeof window > "u";
globalThis.isServerStreaming = false;
const R = () => globalThis.isServerStreaming, he = (e) => globalThis.isServerStreaming = e;
let w$2 = [], g$1 = 0;
function A$1() {
  return { renderedNodes: w$2, get currentNode() {
    if (!h$1) return w$2[g$1];
  }, get isHydrating() {
    return !!w$2[g$1];
  }, next: () => {
    w$2[g$1] && (w$2[g$1] = void 0, g$1++);
  }, prev: () => {
    g$1 > 0 && w$2[g$1 - 1] && g$1--;
  } };
}
function ge(e, t) {
  w$2 = e;
}
let W = [];
const F$1 = /* @__PURE__ */ new Map();
function we(e, t) {
  F$1.set(e, t);
}
function j$1(e) {
  const t = F$1.get(e);
  if (t) {
    for (const n of t) n();
    F$1.delete(e);
  }
  if (e instanceof HTMLElement) for (const n of e.childNodes) j$1(n);
}
let v = null;
function x$1() {
  return v;
}
function G(e) {
  return { parent: e, context: /* @__PURE__ */ new Map(), cleanups: [] };
}
function ve() {
  let e = v;
  const t = [];
  for (; e && e.parent; ) t.push(...e.cleanups), e = e.parent;
  for (const n of t) n();
}
function K(e, t) {
  const n = v;
  v = e;
  try {
    return t();
  } finally {
    queueMicrotask(() => {
      v = n;
    });
  }
}
function N(e, t) {
  const n = v;
  n && n.context.set(e, t);
}
function H$1(e) {
  let t = v;
  for (; t; ) {
    if (t.context.has(e)) return t.context.get(e);
    t = t.parent;
  }
}
let m$1 = null;
function J(e) {
  m$1 = e;
}
const P$1 = /* @__PURE__ */ new Set();
let q$1 = false;
function Se(e) {
  P$1.add(e), q$1 || (q$1 = true, queueMicrotask(() => {
    for (const t of P$1) t();
    P$1.clear(), q$1 = false;
  }));
}
function b$2(e) {
  const t = () => {
    V(t), t.cleanup && (t.cleanup(), t.cleanup = void 0);
    const o = m$1;
    m$1 = t;
    try {
      const r2 = e();
      typeof r2 == "function" && (t.cleanup = r2);
    } finally {
      m$1 = o;
    }
  }, n = () => V(t);
  return t.deps = [], t(), n;
}
function V(e) {
  if (e.deps) {
    for (const t of e.deps) t.delete(e);
    e.deps.length = 0;
  }
  e.cleanup && (e.cleanup(), e.cleanup = void 0);
}
function X(e) {
  const t = m$1;
  J(null);
  try {
    return e();
  } finally {
    J(t);
  }
}
const U = (e) => (Array.isArray(e) ? e : [e]).flat(1 / 0), Q = (e) => e.flat(1 / 0);
function Y(e) {
  const t = x$1();
  if (!t) throw new Error("onDestroy called outside of component");
  t.cleanups.push(e);
}
function Z(e) {
  if (h$1) return;
  const t = x$1();
  if (!t) throw new Error("onMount called outside of component");
  queueMicrotask(async () => {
    const n = await e();
    n instanceof Function && t.cleanups.push(n);
  });
}
const B = /* @__PURE__ */ new WeakMap();
function ee(e, t) {
  if (!m$1) return;
  let n = B.get(e);
  n || (n = /* @__PURE__ */ new Map(), B.set(e, n));
  let o = n.get(t);
  o || (o = /* @__PURE__ */ new Set(), n.set(t, o)), o.has(m$1) || (o.add(m$1), m$1.deps ? m$1.deps.push(o) : m$1.deps = [o]);
}
function ne(e, t) {
  const n = B.get(e);
  if (!n) return;
  const o = n.get(t);
  if (o) for (const r2 of o) Se(r2);
}
function C$1(e) {
  let t = H$1("state");
  if (t || (t = { states: [], index: 0 }, N("state", t)), t) {
    const { states: n, index: o } = t;
    if (n.length <= o) {
      const r2 = te(e);
      n.push(r2);
    }
    return n[t.index++];
  }
  return te(e);
}
function te(e) {
  const t = { value: e };
  return new Proxy(t, { get(n, o, r2) {
    return ee(n, o), Reflect.get(n, o, r2);
  }, set(n, o, r2, s) {
    const i = n[o], c = Reflect.set(n, o, r2, s);
    return i !== r2 && ne(n, o), c;
  } });
}
const L$1 = (e) => e == null || e === false;
function oe(e) {
  return !/<[^>]+>/g.test(e);
}
function re(e, t = false) {
  if (L$1(e)) return null;
  if (typeof e == "string" || typeof e == "number") {
    let n = String(e);
    return oe(n) && !t && !n.length && (n = `<!--empty-->${n}`), n;
  }
  throw new Error(`Unknown value: ${e}`);
}
function y(e) {
  return L$1(e) ? null : typeof e == "function" ? y(e()) : Array.isArray(e) ? e.map(y).join("") || null : re(e);
}
function Ee({ children: e, fallback: t = () => null }) {
  const n = _().suspenseID++;
  try {
    return y(e);
  } catch (o) {
    if (o instanceof Promise) return [y(t), `<script>window.__SUSPENSE_DEFAULT_FALLBACK__ ??= [];window.__SUSPENSE_DEFAULT_FALLBACK__[${n}]=true;document.currentScript.remove();<\/script>`, "<!--split-->"];
    throw o;
  }
}
function _e({ children: e, fallback: t = () => null }) {
  const n = _().suspenseID++, o = k$1(), r2 = (s) => {
    o.promises.push(s), s.then(() => {
      const i = y(e), c = `<template async-id="${n}">${i}</template>`, a2 = `<script>__hydrateAsync("${n}");document.currentScript.remove();<\/script>`;
      o.controller.enqueue(o.encoder.encode(c)), o.controller.enqueue(o.encoder.encode(a2));
    }).catch((i) => {
      if (i instanceof Promise) r2(i);
      else throw i;
    });
  };
  try {
    return y(e);
  } catch (s) {
    return s instanceof Promise && r2(s), [`<!--~$:${n}-->`, y(t), `<!--/$:${n}-->`];
  }
}
const M$1 = [];
function Ae() {
  return M$1[M$1.length - 1];
}
function se(e) {
  const { fallback: t = () => null, children: n } = e;
  if (R()) return _e({ fallback: t, children: n });
  if (h$1) return Ee({ fallback: t, children: n });
  window.__SUSPENSE_DEFAULT_FALLBACK__ ?? (window.__SUSPENSE_DEFAULT_FALLBACK__ = []);
  const o = _().suspenseID++, r2 = !!window.__SUSPENSE_DEFAULT_FALLBACK__[o], s = C$1(r2 ? t : n);
  function i(c) {
    M$1.pop(), queueMicrotask(() => {
      s.value = "__fromLazy" in c ? () => null : t;
    }), c.then(() => {
      N("is-suspending", false), s.value = n;
    });
  }
  return !h$1 && window.__SSR_STREAMING_APP__ ? s.value = n : ce(() => {
    s.value = n;
  }), N("is-suspending", true), () => (M$1.push(i), s.value);
}
function ce(e) {
  if (!A$1().isHydrating) {
    e();
    return;
  }
  requestAnimationFrame(() => ce(e));
}
function xe(e) {
  if (e instanceof Node) return e;
  if (typeof e == "string" || typeof e == "number") {
    const { currentNode: t, next: n } = A$1();
    if (t instanceof Text && true) {
      if (t.textContent !== String(e)) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
      return n(), t;
    }
    return document.createTextNode(String(e));
  }
  throw new Error(`Unknown value: ${e}`);
}
function S(e, t, n = null) {
  if (!L$1(n) && !(n == null ? void 0 : n.parentNode)) return () => {
  };
  let o = [];
  for (const r2 of Q(U(t))) {
    let s = [], i = [];
    const c = z(`anchor-${r2}`, true);
    e.insertBefore(c, n);
    let a2 = null;
    const p = Ae(), u2 = b$2(() => {
      try {
        i.map((f) => f()), i = [];
        const l = typeof r2 == "function" ? r2() : r2;
        if (L$1(l)) a2 && (e.removeChild(a2), a2 = null);
        else if (typeof l == "function") {
          const f = S(e, l, c);
          i.push(f);
        } else if (Array.isArray(l)) {
          const f = S(e, l, c);
          i.push(f);
        } else {
          const f = xe(l);
          a2 ? e.replaceChild(f, a2) : f.isConnected ? (n && e.insertBefore(n, f.nextSibling), e.insertBefore(c, f.nextSibling)) : e.insertBefore(f, c), a2 = f;
        }
        o.push(() => {
          if (a2) {
            if (H$1("is-suspending") && T.has(a2)) return;
            a2.remove();
          }
        });
      } catch (l) {
        if (l instanceof Promise && p) p(l);
        else throw l;
      }
    }), d = () => {
      for (const l of i) l();
      for (const l of s) l();
      i = [], s = [], u2(), c.remove();
    };
    o.push(d);
  }
  return () => {
    for (const r2 of o) r2();
    o = [];
  };
}
function ue({ children: e, target: t }) {
  let n;
  return Z(() => {
    const o = (t instanceof Function ? t() : t) ?? document.body;
    n = S(o, e);
  }), Y(() => {
    n();
  }), () => null;
}
const Ne = [se, fe, ue];
function ae(e, t = {}) {
  if (!Ne.includes(e)) for (const n in t) t[n] = t[n] instanceof Function ? t[n]() : t[n];
}
const T = /* @__PURE__ */ new WeakSet();
function O(e, t, n) {
  const o = x$1(), r2 = G(o);
  return K(r2, () => {
    ae(e, t);
    const s = z(`root-${e.name}-${n == null ? void 0 : n.toString()}`);
    t && n && (t.children = n);
    const i = X(() => e(t)), c = U([i, s]).flat();
    return T.add(s), we(s, r2.cleanups), queueMicrotask(() => {
      s.parentNode && (h$1 || new MutationObserver((a2) => {
        for (const p of a2) for (const u2 of p.removedNodes) (u2 === s || !s.isConnected) && j$1(s);
      }).observe(s.parentNode, { childList: true, subtree: true }));
    }), c;
  });
}
function z(e, t = false) {
  let n;
  return process.env.NODE_ENV === "development" && !t ? n = document.createComment(e) : n = document.createTextNode(""), T.add(n), n;
}
const $ = /* @__PURE__ */ new WeakMap();
function be(e, t, n) {
  let o = $.get(e);
  o || (o = /* @__PURE__ */ new Map(), $.set(e, o)), o.has(t) && e.removeEventListener(t, o.get(t)), e.addEventListener(t, n), o.set(t, n);
}
function Ce(e, t) {
  const n = $.get(e);
  if (!n) return;
  const o = n.get(t);
  o && (e.removeEventListener(t, o), n.delete(t)), n.size === 0 && $.delete(e);
}
function Me(e, t) {
  const n = [];
  for (const o in t) {
    const r2 = () => {
      if (A$1().isHydrating) {
        requestAnimationFrame(r2);
        return;
      }
      const s = b$2(() => {
        const i = t[o], c = typeof i == "function" && o !== "ref" ? i() : i;
        if (o.startsWith("on") && e instanceof HTMLElement) {
          const p = o.slice(2).toLowerCase();
          return be(e, p, c), () => Ce(e, p);
        }
        const a2 = e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement;
        if (o === "value" && a2 && typeof t.onInput != "function" && typeof t.onChange != "function") {
          e.value = c;
          const p = () => {
            e.value !== c && (e.value = c);
          };
          return e.setAttribute(o, c), e.addEventListener("input", p), () => e.removeEventListener("input", p);
        }
        if (o === "ref" && typeof c == "function") {
          c(e);
          return;
        }
        if (o === "style" && typeof c == "object" && e instanceof HTMLElement) {
          Te(e, c);
          return;
        }
        if (typeof c == "boolean") {
          e.toggleAttribute(o, c);
          return;
        }
        if (o === "html" && typeof c == "string") {
          e.innerHTML = c;
          return;
        }
        e.setAttribute(o, c);
      });
      n.push(s);
    };
    r2();
  }
  return () => {
    for (const o of n) o();
  };
}
function De(e) {
  return CSS.supports(e, "0") && !CSS.supports(e, "0px");
}
function Te(e, t) {
  if (e instanceof HTMLElement) for (const n in t) {
    if (!Object.hasOwn(t, n)) continue;
    const o = t[n];
    if (o == null || n === "length" || n === "parentRule") continue;
    const r2 = typeof o == "number", s = r2 && !De(n);
    e.style[n] = r2 ? s ? `${o}px` : `${o}` : String(o);
  }
}
function le(e, t = {}, n, o) {
  var _a;
  if (typeof e == "function") return O(e, { ...t, key: o }, n);
  if (e === "html") return n;
  E.push(((_a = t.xmlns) == null ? void 0 : _a.call(t)) ?? E[E.length - 1]);
  const r2 = $e(e), s = z("h-anchor", true);
  r2.appendChild(s);
  const i = S(r2, n, s), c = Me(r2, t);
  return queueMicrotask(() => {
    if (!r2.parentNode) return;
    const a2 = new MutationObserver((p) => {
      for (const u2 of p) for (const d of u2.removedNodes) r2.isSameNode(d) && (i(), c(), a2.disconnect());
    });
    a2.observe(r2.parentNode, { childList: true, subtree: true });
  }), E.pop(), r2;
}
const E = [];
function $e(e) {
  const { currentNode: t, next: n } = A$1();
  if (t instanceof Element && true) {
    if (t.tagName.toLowerCase() !== e) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
    return n(), t;
  }
  const o = E[E.length - 1];
  return o ? document.createElementNS(o, e) : document.createElement(e);
}
function ke(e, t) {
  let n = [];
  return () => {
    var _a;
    const o = e() || [], r2 = o.length, s = new Array(r2), i = /* @__PURE__ */ new Map();
    for (let u2 = 0; u2 < n.length; u2++) {
      const d = n[u2].value;
      i.has(d) || i.set(d, []), i.get(d).push(u2);
    }
    const c = new Array(r2).fill(-1);
    for (let u2 = 0; u2 < r2; u2++) {
      const d = o[u2], l = i.get(d);
      if (l && l.length) {
        const f = l.shift();
        c[u2] = f, s[u2] = n[f];
      } else {
        const f = C$1(u2), pe = t(d, f);
        s[u2] = { value: d, index: f, element: pe };
      }
    }
    const a2 = Ie(c);
    let p = a2.length - 1;
    for (let u2 = r2 - 1; u2 >= 0; u2--) {
      const d = s[u2];
      if (c[u2] === -1 || u2 !== a2[p]) {
        const l = u2 + 1 < r2 ? s[u2 + 1].element : null;
        (_a = d.element.parentNode) == null ? void 0 : _a.insertBefore(d.element, l);
      } else p--;
      d.index.value = u2;
    }
    return n = s, n.map((u2) => u2.element);
  };
}
function Ie(e) {
  const t = e.slice(), n = [];
  let o, r2;
  for (let s = 0; s < e.length; s++) {
    const i = e[s];
    if (!(i < 0)) {
      if (n.length === 0 || e[n[n.length - 1]] < i) {
        t[s] = n.length > 0 ? n[n.length - 1] : -1, n.push(s);
        continue;
      }
      for (o = 0, r2 = n.length - 1; o < r2; ) {
        const c = (o + r2) / 2 | 0;
        e[n[c]] < i ? o = c + 1 : r2 = c;
      }
      i < e[n[o]] && (o > 0 && (t[s] = n[o - 1]), n[o] = s);
    }
  }
  for (o = n.length, r2 = n[o - 1]; o-- > 0; ) n[o] = r2, r2 = t[r2];
  return n;
}
function fe({ each: e, children: t }) {
  const n = C$1([]), o = ke(e, t);
  return b$2(() => {
    n.value = o();
  }), () => n.value;
}
const C = "lazy", M = "/lazy", P = (r2, e = "default") => {
  let t, i, o, a2 = null;
  const n = () => {
    if (i) try {
      return i;
    } finally {
      i = void 0;
    }
    throw o || (a2 = r2().then(async (s) => {
      if (!(e in s)) throw new Error(`lazy(): Export "${String(e)}" not found in module`);
      i = (() => {
        const u2 = W[t] || [];
        return ge([...A$1().renderedNodes, ...u2]), W[t] = [], s[e]();
      });
    }).catch((s) => {
      o = s instanceof Error ? s : new Error(String(s));
    }), !R() && A$1().isHydrating ? Object.assign(a2, { __fromLazy: true }) : a2);
  };
  return () => {
    if (t ?? (t = _().lazyID++), h$1 && !R()) throw new Promise(() => {
    });
    const s = n()();
    return R() ? () => [`<!--${C}:${t}-->`, s instanceof Function ? s() : s, `<!--${M}:${t}-->`] : s;
  };
};
const h = /* @__PURE__ */ new WeakMap();
function b$1(r2) {
  function e(t) {
    if (h.has(t)) return h.get(t);
    const i = new Proxy(t, { get(o, a2, n) {
      ee(o, a2);
      const s = Reflect.get(o, a2, n);
      if (typeof s == "function") return s.bind(n);
      const u2 = Reflect.getOwnPropertyDescriptor(o, a2);
      return (u2 == null ? void 0 : u2.get) ? u2.get.call(n) : typeof s == "object" && s !== null ? e(s) : s;
    }, set(o, a2, n, s) {
      const u2 = o[a2], f = Reflect.set(o, a2, n, s);
      return u2 !== n && ne(o, a2), f;
    } });
    return h.set(t, i), i;
  }
  return e(r2);
}
function A(r2, e, t = true) {
  const i = k$1(), o = _(), a2 = o.resourceID++, n = b$1({ loading: true, error: null, data: void 0, promiseStatus: "pending" });
  let s = null;
  const u2 = () => {
    var _a;
    const f = e.map((l) => l());
    X(() => {
      n.loading = true, n.error = null, n.data = void 0, n.promiseStatus = "pending";
    }), !R() && !h$1 && window.__resource && ((_a = window.__resource) == null ? void 0 : _a[a2]) && t ? (X(() => {
      var _a2;
      n.data = (_a2 = window.__resource) == null ? void 0 : _a2[a2], n.error = null, n.promiseStatus = "fulfilled", n.loading = false;
    }), delete window.__resource[a2], window.__resource.length || delete window.__resource) : (s = X(() => r2(...f)), s.then((l) => {
      X(() => {
        n.data = l, n.error = null, n.promiseStatus = "fulfilled", n.loading = false;
      }), R() && t && i.controller.enqueue(i.encoder.encode(`<script>window.__resource ??= []; window.__resource[${a2}] = ${JSON.stringify(l)};document.currentScript.remove();<\/script>`));
    }).catch((l) => {
      X(() => {
        n.data = void 0, n.error = l, n.promiseStatus = "rejected", n.loading = false;
      });
    }));
  };
  return b$2(() => {
    u2();
  }), { get loading() {
    return n.loading;
  }, get error() {
    return n.error;
  }, get data() {
    if (n.promiseStatus === "pending") throw s;
    if (n.promiseStatus === "rejected") throw n.error;
    return n.data;
  }, refetch: u2, mutate(f) {
    n.data = f;
  } };
}
function L() {
  const r2 = Symbol();
  return { id: r2, Provider: (e) => () => (N(r2, e.value), e.children) };
}
function F(r2) {
  return H$1(r2.id);
}
function q(r2) {
  const e = C$1();
  return b$2(() => {
    e.value = r2();
  }), { get value() {
    return e.value;
  } };
}
function H(r2) {
  const e = _().memo;
  function t(i) {
    h$1 || Y(() => {
      e.delete(t);
    });
    let o = e.get(t);
    return o || (o = { lastProps: void 0, hasLast: false, lastResult: void 0 }, e.set(t, o)), o.hasLast && w$1(o.lastProps, i) || (o.lastProps = i, o.lastResult = r2(i), o.hasLast = true), o.lastResult;
  }
  return t;
}
function w$1(r2, e) {
  if (r2 === e || r2 !== r2 && e !== e) return true;
  if (r2 == null || e == null) return false;
  if (r2 instanceof Date && e instanceof Date) return r2.getTime() === e.getTime();
  if (r2 instanceof RegExp && e instanceof RegExp) return r2.toString() === e.toString();
  if (Array.isArray(r2) && Array.isArray(e)) {
    if (r2.length !== e.length) return false;
    for (let t = 0; t < r2.length; t++) if (!w$1(r2[t], e[t])) return false;
    return true;
  }
  if (typeof r2 == "object" && typeof e == "object" && r2.constructor === Object && e.constructor === Object) {
    const t = Object.keys(r2), i = Object.keys(e);
    if (t.length !== i.length) return false;
    for (const o of t) if (!Object.prototype.hasOwnProperty.call(e, o) || !w$1(r2[o], e[o])) return false;
    return true;
  }
  return false;
}
function a(t) {
  const o = [];
  for (const n in t) {
    if (n.startsWith("on") && typeof t[n] == "function") continue;
    const e = typeof t[n] == "function" ? t[n]() : t[n];
    if (n !== "ref" && n !== "style" && n !== "html") {
      if (typeof e == "boolean") {
        e && o.push(n);
        continue;
      }
      o.push(`${n}="${e}"`);
    }
  }
  return o.length > 0 && o.unshift(""), o.join(" ");
}
const b = /* @__PURE__ */ new Set(["title", "meta", "script", "style"]);
function u(t, o) {
  const n = [];
  for (const e of Q(U(o))) {
    const s = typeof e == "function" ? e() : e;
    if (L$1(s)) continue;
    if (typeof s == "function" || Array.isArray(s)) {
      const c = u(t, s);
      L$1(c) || n.push(c);
      continue;
    }
    const r2 = re(s, b.has(t));
    L$1(r2) || n.push(r2);
  }
  for (const [e] of n.entries()) n[e] && n[e + 1] && oe(n[e]) && oe(n[e + 1]) && n.splice(e + 1, 0, "<!--split-->");
  return n.join("") || null;
}
function w(t, o, n) {
  ae(t, o);
  const e = x$1(), s = G(e);
  return K(s, () => (o && n && (o.children = n), X(() => t(o))));
}
const j = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
function k(t, o = {}, n, e) {
  if (typeof t == "function") return w(t, { ...o, key: e }, n);
  if (j.has(t)) return `<${t}${a(o)}>`;
  const s = u(t, "html" in o ? o.html : n) || "";
  return `<${t}${a(o)}>${s}</${t}>`;
}
const x = (s, { children: r2, ...o } = {}, a2) => h$1 ? k(s, o, r2, a2) : le(s, o, r2, a2);
const isServer = typeof window === "undefined";
const $location = b$1({
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
function isActiveRoute(targetpath) {
  const pathname = $location.pathname;
  if (targetpath === "/") {
    return targetpath === pathname;
  }
  function toSegment(fullpath) {
    return fullpath.split("/").filter(Boolean).map((path) => `${path}`);
  }
  const pathnameSegment = toSegment(pathname);
  const targetnameSegment = toSegment(targetpath);
  if (pathnameSegment.length !== targetnameSegment.length) {
    return false;
  }
  return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}
function matchRoute(targetpath) {
  const pathname = $location.pathname;
  if (targetpath === "/") {
    return pathname.startsWith("/");
  }
  function toSegment(fullpath) {
    return fullpath.split("/").filter(Boolean).map((path) => `${path}`);
  }
  const pathnameSegment = toSegment(pathname);
  const targetnameSegment = toSegment(targetpath);
  return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}
const resolve = (routes2) => {
  let oldPath;
  const view = C$1(() => null);
  b$2(() => {
    for (const route of routes2) {
      if (matchRoute(route.path)) {
        if (oldPath !== route.path) {
          oldPath = route.path;
          const children = (route.children || []).map((childRoute) => {
            return {
              ...childRoute,
              path: (route.path === "/" ? "" : route.path) + childRoute.path
            };
          });
          view.value = () => route.component({
            children: () => resolve(children)
          });
        }
      }
    }
  });
  return () => {
    const Component2 = view.value;
    return () => /* @__PURE__ */ x(Component2, {});
  };
};
function Router(props) {
  if (props.url) $location.pathname = props.url;
  return () => /* @__PURE__ */ x(r, {
    children: () => resolve(props.routes)
  });
}
const Template = ({
  title,
  children
}) => {
  return () => /* @__PURE__ */ x("div", {
    class: () => "p-2 w-full",
    children: () => [() => /* @__PURE__ */ x("h1", {
      class: () => "font-bold text-2xl mb-2",
      children: () => title
    }), () => children()]
  });
};
const ButtonPageList = () => {
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Pages",
    children: () => /* @__PURE__ */ x("ul", {
      class: () => "flex flex-col gap-2",
      children: () => [() => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/"),
          disabled: () => isActiveRoute("/"),
          children: () => "All"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/lazy"),
          disabled: () => isActiveRoute("/lazy"),
          children: () => "Lazy"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/forms"),
          disabled: () => isActiveRoute("/forms"),
          children: () => "Forms"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/contexts"),
          disabled: () => isActiveRoute("/contexts"),
          children: () => "Contexts"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/dropdown-list"),
          disabled: () => isActiveRoute("/dropdown-list"),
          children: () => "Dropdown Lists"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/non-async-suspense"),
          disabled: () => isActiveRoute("/non-async-suspense"),
          children: () => "Non Async Suspense"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/stacked-suspense"),
          disabled: () => isActiveRoute("/stacked-suspense"),
          children: () => "Stacked Suspense"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/poke-dex"),
          disabled: () => isActiveRoute("/poke-dex"),
          children: () => "PokeDex List"
        })
      }), () => /* @__PURE__ */ x("li", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => navigate("/poke-dex-suspense"),
          disabled: () => isActiveRoute("/poke-dex-suspense"),
          children: () => "PokeDex List with Suspense"
        })
      })]
    })
  });
};
const Contexts = H(() => {
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Contexts",
    children: () => [() => /* @__PURE__ */ x(Form, {
      children: () => /* @__PURE__ */ x(Input$1, {})
    }), () => /* @__PURE__ */ x(Form, {
      children: () => /* @__PURE__ */ x(Wrapper, {
        children: () => /* @__PURE__ */ x(Input$1, {})
      })
    })]
  });
});
const NameContext = L();
const Form = H(({
  children
}) => {
  const state = b$1({
    name: "asd"
  });
  return () => /* @__PURE__ */ x(NameContext.Provider, {
    value: () => state,
    children: () => children()
  });
});
function Wrapper({
  children
}) {
  return () => /* @__PURE__ */ x(r, {
    children: () => [() => /* @__PURE__ */ x("div", {
      children: () => "Hi"
    }), () => " ", () => children()]
  });
}
const Input$1 = H(() => {
  const forms = F(NameContext);
  const i = C$1(0);
  const cleanup = setInterval(() => {
    i.value++;
  }, 1e3);
  Y(() => {
    console.log("cleared tanga");
    clearInterval(cleanup);
  });
  const nameEl = () => /* @__PURE__ */ x("div", {
    children: () => [() => "Name: ", () => forms.name, () => " Hi"]
  });
  console.log("hi");
  return () => /* @__PURE__ */ x(r, {
    children: () => [() => /* @__PURE__ */ x("div", {
      children: () => [() => "Name: ", () => forms.name]
    }), () => nameEl, () => /* @__PURE__ */ x("input", {
      type: () => "text",
      name: () => "name",
      onInput: () => (event) => forms.name = event.currentTarget.value,
      placeholder: () => "name",
      autoComplete: () => "off",
      value: () => forms.name
    }), " ", () => i.value]
  });
});
const name = b$1({
  firstName: "First name",
  lastName: "Last name"
});
const sleep = (ms) => new Promise((resolve2) => {
  setTimeout(resolve2, ms);
});
const Dropdowns = H(() => {
  console.log("Dropdown rerender");
  const dropdownStore = b$1({
    showDropdown: false,
    sortDirection: "asc",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8],
    handleSort() {
      this.numbers = [...this.numbers].sort((a2, b2) => {
        return this.sortDirection === "desc" ? a2 - b2 : b2 - a2;
      });
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    },
    handleRandomize() {
      const result = [...this.numbers];
      for (let i = result.length - 1; i > 0; i--) {
        const j2 = Math.floor(Math.random() * (i + 1));
        [result[i], result[j2]] = [result[j2], result[i]];
      }
      this.numbers = result;
    },
    addDropdown() {
      let currentNumbers = [...this.numbers];
      if (currentNumbers.length >= 8) return;
      currentNumbers = currentNumbers.sort((a2, b2) => a2 - b2);
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
  b$2(() => {
    console.log(dropdownStore.numbers);
  });
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Dropdown List",
    children: () => /* @__PURE__ */ x("div", {
      class: () => "flex flex-col gap-4",
      children: () => [() => /* @__PURE__ */ x("div", {
        children: () => /* @__PURE__ */ x("div", {
          class: () => "flex gap-2 items-center",
          children: () => [() => /* @__PURE__ */ x("span", {
            children: () => "Add Dropdown"
          }), () => /* @__PURE__ */ x("button", {
            class: () => "btn",
            onClick: () => dropdownStore.addDropdown,
            children: () => "+"
          }), () => /* @__PURE__ */ x("button", {
            class: () => "btn",
            onClick: () => dropdownStore.removeDropdown,
            children: () => "-"
          })]
        })
      }), () => /* @__PURE__ */ x("div", {
        class: () => "flex gap-2 items-center",
        children: () => [() => /* @__PURE__ */ x("span", {
          children: () => "Sort"
        }), () => /* @__PURE__ */ x("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleSort,
          children: () => dropdownStore.sortDirection === "asc" ? "↑" : "↓"
        }), () => /* @__PURE__ */ x("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleRandomize,
          children: () => "Randomize"
        })]
      }), () => /* @__PURE__ */ x("div", {
        children: () => /* @__PURE__ */ x("button", {
          onClick: () => () => dropdownStore.showDropdown = !dropdownStore.showDropdown,
          children: () => "Unmount Dropdown List"
        })
      }), () => dropdownStore.showDropdown && /* @__PURE__ */ x(DropdownList, {
        dropdowns: () => dropdownStore
      }), () => /* @__PURE__ */ x("div", {
        children: () => "Hi"
      })]
    })
  });
});
const DropdownList = H(({
  dropdowns
}) => {
  console.log("weh");
  return () => /* @__PURE__ */ x("div", {
    class: () => "flex gap-2 flex-col lg:flex-row",
    children: () => dropdowns.numbers.map((number) => /* @__PURE__ */ x(Dropdown, {
      number: () => number
    }, () => number))
  });
});
const Dropdown = H(({
  number
}) => {
  console.log("rerender");
  const isOpen = C$1(false);
  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };
  return () => /* @__PURE__ */ x(r, {
    children: () => /* @__PURE__ */ x("div", {
      class: () => "relative lg:w-[calc(100%/8)]",
      children: () => [() => /* @__PURE__ */ x("div", {
        children: () => [() => /* @__PURE__ */ x("button", {
          class: () => "btn w-full",
          onClick: () => handleToggle,
          children: () => [() => "Open Dropdown ", () => number]
        }), () => /* @__PURE__ */ x("div", {
          class: () => "break-all",
          children: () => [() => "Hi ", () => name.firstName]
        })]
      }), () => isOpen.value && /* @__PURE__ */ x("div", {
        class: () => "absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10",
        children: () => /* @__PURE__ */ x("ul", {
          children: () => Array.from({
            length: 3
          }).map((_2, i) => i + 1).map((item) => /* @__PURE__ */ x("li", {
            class: () => "cursor-pointer p-2 rounded hover:bg-gray-100",
            children: () => [() => "Dropdown ", () => item]
          }))
        })
      })]
    })
  });
});
const Forms = H(() => {
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Forms",
    children: () => /* @__PURE__ */ x("div", {
      children: () => [() => /* @__PURE__ */ x("div", {
        children: () => [() => /* @__PURE__ */ x("label", {
          class: () => "break-all",
          for: () => "name-input2",
          children: () => [() => "Hi ", () => name.firstName]
        }), () => /* @__PURE__ */ x("div", {
          children: () => /* @__PURE__ */ x("input", {
            type: () => "text",
            value: () => name.firstName,
            id: () => "name-input2"
          })
        })]
      }), () => /* @__PURE__ */ x("div", {
        children: () => [() => /* @__PURE__ */ x(Counter, {}, () => 1), () => /* @__PURE__ */ x(Input, {}, () => 2)]
      })]
    })
  });
});
const Counter = H(() => {
  const count = C$1(0);
  const double = q(() => count.value * 2);
  const handleCount = () => {
    count.value++;
  };
  b$2(() => {
  });
  b$2(() => {
  });
  console.log("rerender?");
  return () => /* @__PURE__ */ x(r, {
    children: () => [() => count.value, () => /* @__PURE__ */ x("div", {
      children: () => [() => "Count: ", () => count.value]
    }), () => /* @__PURE__ */ x("div", {
      children: () => [() => "Double Count: ", () => double.value]
    }), () => /* @__PURE__ */ x("button", {
      disabled: () => count.value >= 5,
      onClick: () => handleCount,
      children: () => "Add counter"
    }), () => /* @__PURE__ */ x("div", {
      children: () => count.value <= 3 ? /* @__PURE__ */ x("div", {
        children: () => "Hi"
      }) : "string"
    })]
  });
});
const Input = H(() => {
  return () => /* @__PURE__ */ x("div", {
    children: () => [() => /* @__PURE__ */ x("label", {
      class: () => "break-all",
      for: () => "name-input",
      children: () => [() => "Name ", () => name.firstName, () => " ", () => /* @__PURE__ */ x("span", {
        children: () => "Hi"
      })]
    }), () => /* @__PURE__ */ x("div", {
      children: () => /* @__PURE__ */ x("input", {
        id: () => "name-input",
        type: () => "text",
        onInput: () => (event) => {
          name.firstName = event.currentTarget.value;
        },
        value: () => name.firstName
      })
    })]
  });
});
const LazyImport = P(() => import("./assets/LazyImport-CRpix3-H.js"), "LazyImport");
const LazyTest = P(() => import("./assets/Test-DUpMVO0O.js"), "Test");
const Lazy = () => {
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Lazy",
    children: () => /* @__PURE__ */ x("div", {
      children: () => [() => /* @__PURE__ */ x(se, {
        fallback: () => "Tester",
        children: () => /* @__PURE__ */ x(LazyImport, {})
      }), () => /* @__PURE__ */ x(se, {
        fallback: () => "Tester2",
        children: () => /* @__PURE__ */ x(LazyTest, {})
      }), () => /* @__PURE__ */ x("h5", {
        children: () => "Test"
      })]
    })
  });
};
function NonAsyncSuspense() {
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Non-Async Suspense",
    children: () => /* @__PURE__ */ x("div", {
      children: () => /* @__PURE__ */ x(se, {
        fallback: () => /* @__PURE__ */ x("div", {
          children: () => "hi"
        }),
        children: () => /* @__PURE__ */ x("div", {
          children: () => "Children"
        })
      })
    })
  });
}
const PokeDex = () => {
  const pokeDex = b$1({
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
      this.pokeDexList = [...this.pokeDexList].sort((a2, b2) => {
        const cmp = a2[key].localeCompare(b2[key]);
        return this.sortDirection === "asc" ? cmp : -cmp;
      });
    }
  });
  Z(async () => {
    console.log("hi");
    const controller = new AbortController();
    await pokeDex.fetchData("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20", controller);
    return () => {
      console.log("Cleaning up PokeDex component");
      controller.abort();
    };
  });
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.handleSort(key);
  return () => /* @__PURE__ */ x(Template, {
    title: () => "PokeDex List",
    children: () => [() => /* @__PURE__ */ x("div", {
      class: () => "break-all",
      children: () => [() => "Hi ", () => name.firstName]
    }), () => /* @__PURE__ */ x("table", {
      class: () => "w-full mx-auto my-2 table-fixed",
      children: () => [() => /* @__PURE__ */ x("thead", {
        children: () => /* @__PURE__ */ x("tr", {
          children: () => [() => /* @__PURE__ */ x("th", {
            class: () => "w-1/3",
            children: () => "ID"
          }), () => /* @__PURE__ */ x("th", {
            onClick: () => sortOnClick("name"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "Name"
          }), () => /* @__PURE__ */ x("th", {
            onClick: () => sortOnClick("url"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "URL"
          })]
        })
      }), () => /* @__PURE__ */ x("tbody", {
        children: () => [() => pokeDex.isLoading && /* @__PURE__ */ x(r, {
          children: () => Array.from({
            length: 20
          }).map((_2, i) => i + 1).map((number) => /* @__PURE__ */ x("tr", {
            children: () => /* @__PURE__ */ x("td", {
              colSpan: () => 3,
              class: () => "h-[24px] text-center",
              children: () => number === 10 && "loading..."
            })
          }))
        }), () => !pokeDex.isLoading && /* @__PURE__ */ x(r, {
          children: () => pokeDex.pokeDexList.map(({
            name: name2,
            url
          }, index) => /* @__PURE__ */ x("tr", {
            children: () => [() => /* @__PURE__ */ x("td", {
              class: () => "w-1/3 text-center",
              children: () => index + 1
            }), () => /* @__PURE__ */ x("td", {
              class: () => "w-1/3 text-center truncate",
              children: () => name2
            }), () => /* @__PURE__ */ x("td", {
              class: () => "w-1/3 text-center truncate",
              onClick: () => showUrlOnClick(url),
              children: () => url
            })]
          }))
        })]
      })]
    }), () => /* @__PURE__ */ x("div", {
      class: () => "flex gap-4 justify-center",
      children: () => [() => /* @__PURE__ */ x("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.prevLink),
        disabled: () => pokeDex.isLoading || !pokeDex.prevLink,
        children: () => "Previous"
      }), () => /* @__PURE__ */ x("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.nextLink),
        disabled: () => pokeDex.isLoading || !pokeDex.nextLink,
        children: () => "Next"
      })]
    })]
  });
};
const PokeDexSuspense = H(() => {
  const pokeDex = b$1({
    url: "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
    sortDirection: "asc",
    sort(key) {
      if (!pokeDexResource.data) return;
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
      pokeDexResource.mutate({
        ...pokeDexResource.data,
        results: [...pokeDexResource.data.results].sort((a2, b2) => {
          const cmp = a2[key].localeCompare(b2[key]);
          return this.sortDirection === "asc" ? cmp : -cmp;
        })
      });
    },
    changeUrl(newUrl) {
      if (pokeDexResource.loading || !newUrl) return;
      this.url = newUrl.replace(/limit=\d+/, "limit=20");
    }
  });
  const pokeDexResource = A(async (url) => {
    const response = await fetch(url);
    const json = await response.json();
    return json;
  }, [() => pokeDex.url]);
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.sort(key);
  Y(() => {
    console.log("pokedex-suspense destroyed");
  });
  return () => /* @__PURE__ */ x(Template, {
    title: () => "PokeDex List (via Suspense)",
    children: () => /* @__PURE__ */ x("div", {
      children: () => [() => /* @__PURE__ */ x("div", {
        class: () => "break-all",
        children: () => [() => "Hi ", () => name.firstName]
      }), () => /* @__PURE__ */ x("table", {
        class: () => "w-full mx-auto my-2 table-fixed",
        children: () => [() => /* @__PURE__ */ x("thead", {
          children: () => /* @__PURE__ */ x("tr", {
            children: () => [() => /* @__PURE__ */ x("th", {
              class: () => "w-1/3",
              children: () => "ID"
            }), () => /* @__PURE__ */ x("th", {
              onClick: () => sortOnClick("name"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "Name"
            }), () => /* @__PURE__ */ x("th", {
              onClick: () => sortOnClick("url"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "URL"
            })]
          })
        }), () => /* @__PURE__ */ x("tbody", {
          children: () => /* @__PURE__ */ x(se, {
            fallback: () => /* @__PURE__ */ x(r, {
              children: () => Array.from({
                length: 20
              }).map((_2, i) => i + 1).map((number) => /* @__PURE__ */ x("tr", {
                children: () => /* @__PURE__ */ x("td", {
                  colSpan: () => 3,
                  class: () => "h-[24px] text-center",
                  children: () => number === 10 && "loading..."
                })
              }))
            }),
            children: () => /* @__PURE__ */ x(r, {
              children: () => pokeDexResource.data.results.map(({
                name: name2,
                url
              }, index) => /* @__PURE__ */ x("tr", {
                children: () => [() => /* @__PURE__ */ x("td", {
                  class: () => "w-1/3 text-center",
                  children: () => index + 1
                }), () => /* @__PURE__ */ x("td", {
                  class: () => "w-1/3 text-center truncate",
                  children: () => name2
                }), () => /* @__PURE__ */ x("td", {
                  class: () => "w-1/3 text-center truncate",
                  onClick: () => showUrlOnClick(url),
                  children: () => url
                })]
              }))
            })
          })
        })]
      }), () => /* @__PURE__ */ x("div", {
        class: () => "flex gap-4 justify-center",
        children: () => [() => /* @__PURE__ */ x("button", {
          class: () => "btn",
          onClick: () => () => {
            var _a;
            pokeDex.changeUrl((_a = pokeDexResource.data) == null ? void 0 : _a.previous);
          },
          disabled: () => {
            var _a;
            return pokeDexResource.loading || !((_a = pokeDexResource.data) == null ? void 0 : _a.previous);
          },
          children: () => "Previous"
        }), () => /* @__PURE__ */ x("button", {
          class: () => "btn",
          onClick: () => () => {
            var _a;
            pokeDex.changeUrl((_a = pokeDexResource.data) == null ? void 0 : _a.next);
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
});
const StackedSuspense = H(() => {
  const msg3 = A(async () => {
    await sleep(300);
    return "hello world 3";
  }, []);
  const msg2 = A(async () => {
    await sleep(200);
    return "hello world 2";
  }, []);
  console.log("suspense parent rerender");
  return () => /* @__PURE__ */ x(Template, {
    title: () => "Stacked Suspense",
    children: () => /* @__PURE__ */ x("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ x(se, {
        fallback: () => "Lick my ass",
        children: () => /* @__PURE__ */ x("input", {
          onInput: () => (event) => {
            msg2.mutate(event.currentTarget.value.toString());
          },
          value: () => msg2.data
        })
      }), () => /* @__PURE__ */ x(se, {
        fallback: () => "Ngee",
        children: () => msg3.data
      }), () => /* @__PURE__ */ x(se, {
        fallback: () => /* @__PURE__ */ x("div", {
          children: () => "loading 1..."
        }),
        children: () => [() => /* @__PURE__ */ x("div", {
          children: () => "hi"
        }), () => /* @__PURE__ */ x(Component, {}), () => /* @__PURE__ */ x(se, {
          fallback: () => /* @__PURE__ */ x("div", {
            children: () => "loading 2..."
          }),
          children: () => msg2.data
        })]
      })]
    })
  });
});
const Component = H(() => {
  const msg = A(async () => {
    await sleep(100);
    return `hello world`;
  }, []);
  console.log("suspense inner rerender");
  Z(() => {
    console.log("bumalik...");
  });
  Y(() => {
    console.log("nawala...");
  });
  return () => /* @__PURE__ */ x("div", {
    children: () => msg.data
  });
});
const routes = [{
  path: "/",
  component: ({
    children
  }) => {
    console.log("layout rerender");
    return () => /* @__PURE__ */ x("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ x(ButtonPageList, {}), () => /* @__PURE__ */ x("div", {
        children: () => [() => /* @__PURE__ */ x("img", {
          src: () => "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRpLi7keg1UMUkBEw-Y1jo04fSydwwnLocNSQ&s",
          alt: () => "monday left me broken",
          fetchpriority: () => "high"
        }), () => children()]
      })]
    });
  },
  children: [{
    path: "/",
    component: () => /* @__PURE__ */ x(r, {
      children: () => [() => /* @__PURE__ */ x(Lazy, {}), () => /* @__PURE__ */ x(Forms, {}), () => /* @__PURE__ */ x(Contexts, {}), () => /* @__PURE__ */ x(Dropdowns, {}), () => /* @__PURE__ */ x(NonAsyncSuspense, {}), () => /* @__PURE__ */ x(StackedSuspense, {}), () => /* @__PURE__ */ x(PokeDex, {}), () => /* @__PURE__ */ x(PokeDexSuspense, {})]
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
function App({
  url
}) {
  const show = C$1(true);
  return () => /* @__PURE__ */ x("div", {
    children: () => [() => show.value && /* @__PURE__ */ x(Router, {
      url: () => url,
      routes: () => routes
    }), () => /* @__PURE__ */ x("button", {
      onClick: () => () => show.value = !show.value,
      children: () => "Toggle"
    })]
  });
}
function g(t) {
  return he(true), me(), new ReadableStream({ async start(n) {
    const o = new AsyncLocalStorage(), s = new TextEncoder();
    globalThis.__stream_context = { encoder: s, controller: n, promises: [] }, o.run(globalThis.__stream_context, () => {
      const c = o.getStore();
      globalThis.__stream_context = c;
      try {
        const r2 = y(t()) || "";
        n.enqueue(s.encode(r2)), m(() => {
          ve(), n.close();
        });
      } catch (r2) {
        console.error("renderToStream error:", r2);
      }
    });
  } });
}
function m(t) {
  queueMicrotask(async () => {
    await globalThis.__stream_context.promises.pop(), globalThis.__stream_context.promises.length ? m(t) : t();
  });
}
const render = (url) => {
  return g(() => /* @__PURE__ */ x(App, {
    url: () => url
  }));
};
export {
  C$1 as C,
  F,
  L,
  P,
  Z,
  b$2 as b,
  r,
  render,
  se as s,
  x
};
