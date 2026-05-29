import { AsyncLocalStorage } from "async_hooks";
function r({ children: n }) {
  return n;
}
const D = () => globalThis.__stream_context, T$1 = /* @__PURE__ */ new Map(), pe = { suspenseID: 0, resourceID: 0, lazyID: 0, stateID: 0, memo: /* @__PURE__ */ new Map() }, h$1 = () => {
  const e = D();
  T$1.has(e) || T$1.set(e, pe);
  const n = T$1.get(e);
  if (!n) throw new Error("[vynn]: context does not exists");
  return n;
}, de = () => {
  h$1().memo.clear(), h$1().lazyID = 0, h$1().resourceID = 0, h$1().stateID = 0, h$1().suspenseID = 0;
}, y = typeof window > "u";
globalThis.isServerStreaming = false;
const W = () => globalThis.isServerStreaming, he = (e) => globalThis.isServerStreaming = e;
let S = [], g$1 = 0;
function v() {
  return { renderedNodes: S, get currentNode() {
    if (!y) return S[g$1];
  }, get isHydrating() {
    return !!S[g$1];
  }, next: () => {
    S[g$1] && (S[g$1] = void 0, g$1++);
  }, prev: () => {
    g$1 > 0 && S[g$1 - 1] && g$1--;
  } };
}
function ge(e, n) {
  S = e;
}
let O = [];
let j$1 = null;
function $$2(e) {
  j$1 = e;
}
function A$1() {
  return j$1;
}
const k$1 = /* @__PURE__ */ new Map(), Se = (e) => {
  let n;
  return e !== void 0 ? (k$1.has(e) || k$1.set(e, { states: [] }), n = k$1.get(e)) : n = { states: [] }, { ...n, index: 0 };
};
function K(e) {
  return { id: e, mount: [], state: Se(e), effect: [], destroy: [], memo: [] };
}
let d = null;
function G(e) {
  d = e;
}
const I = /* @__PURE__ */ new Set();
let H = false;
function we(e) {
  I.add(e), H || (H = true, queueMicrotask(() => {
    for (const n of I) n();
    I.clear(), H = false;
  }));
}
function C$1(e) {
  const n = A$1(), t = () => {
    P(t), t.cleanup && (t.cleanup(), t.cleanup = void 0);
    const r2 = d;
    d = t, n && n.effect.push(t);
    try {
      const s = e();
      typeof s == "function" && (t.cleanup = s);
    } finally {
      d = r2;
    }
  }, o = () => P(t);
  return t.deps = [], t(), o;
}
function P(e) {
  if (e.deps) {
    for (const n of e.deps) n.delete(e);
    e.deps.length = 0;
  }
  e.cleanup && (e.cleanup(), e.cleanup = void 0);
}
const F = /* @__PURE__ */ new Map();
function ve(e, n) {
  F.set(e, n);
}
function J(e) {
  const n = F.get(e);
  if (n) {
    for (const t of n) t();
    F.delete(e);
  }
  if (e instanceof HTMLElement) for (const t of e.childNodes) J(t);
}
function Ee(e, n) {
  if (!n) return;
  const t = [];
  ve(e, t);
  const o = async () => {
    for (const r2 of n.mount) {
      const s = await r2();
      s && t.push(s);
    }
    for (const r2 of n.destroy) t.push(r2);
    for (const r2 of n.effect) t.push(() => Promise.resolve(P(r2)));
  };
  V(() => {
    queueMicrotask(() => Promise.resolve().then(o));
  });
}
function V(e) {
  if (!v().isHydrating) {
    e();
    return;
  }
  requestAnimationFrame(() => V(e));
}
function X(e) {
  const n = d;
  G(null);
  try {
    return e();
  } finally {
    G(n);
  }
}
const U = (e) => (Array.isArray(e) ? e : [e]).flat(1 / 0), Q = (e) => e.flat(1 / 0);
function Y(e) {
  const n = A$1();
  if (!n) throw new Error("onDestroy called outside of component");
  n.destroy.push(e);
}
function Z(e) {
  if (y) return;
  const n = A$1();
  if (!n) throw new Error("onMount called outside of component");
  n.mount.push(e);
}
const q = /* @__PURE__ */ new WeakMap();
function ee(e, n) {
  if (!d) return;
  let t = q.get(e);
  t || (t = /* @__PURE__ */ new Map(), q.set(e, t));
  let o = t.get(n);
  o || (o = /* @__PURE__ */ new Set(), t.set(n, o)), o.has(d) || (o.add(d), d.deps ? d.deps.push(o) : d.deps = [o]);
}
function te(e, n) {
  const t = q.get(e);
  if (!t) return;
  const o = t.get(n);
  if (o) for (const r2 of o) we(r2);
}
function x(e) {
  const n = A$1();
  if (n && n.state) {
    const { states: t, index: o } = n.state;
    if (t.length <= o) {
      const r2 = ne(e);
      t.push(r2);
    }
    return t[n.state.index++];
  }
  return ne(e);
}
function ne(e) {
  const n = { value: e };
  return new Proxy(n, { get(t, o, r2) {
    return ee(t, o), Reflect.get(t, o, r2);
  }, set(t, o, r2, s) {
    const u2 = t[o], c = Reflect.set(t, o, r2, s);
    return u2 !== r2 && te(t, o), c;
  } });
}
const L = (e) => e == null || e === false;
function oe(e) {
  return !/<[^>]+>/g.test(e);
}
function re(e, n = false) {
  if (L(e)) return null;
  if (typeof e == "string" || typeof e == "number") {
    let t = String(e);
    return oe(t) && !n && !t.length && (t = `<!--empty-->${t}`), t;
  }
  throw new Error(`Unknown value: ${e}`);
}
function w$1(e) {
  return L(e) ? null : typeof e == "function" ? w$1(e()) : Array.isArray(e) ? e.map(w$1).join("") || null : re(e);
}
function _e({ children: e, fallback: n = () => null }) {
  const t = h$1(), o = t.suspenseID++;
  try {
    return w$1(e);
  } catch (r2) {
    if (r2 instanceof Promise) return [w$1(n), `<script>window.__SUSPENSE_DEFAULT_FALLBACK__ ??= [];window.__SUSPENSE_DEFAULT_FALLBACK__[${o}]=true;document.currentScript.remove();<\/script>`, "<!--split-->"];
    throw r2;
  }
}
function Le({ children: e, fallback: n = () => null }) {
  const t = h$1(), o = t.suspenseID++, { controller: r2, encoder: s, end: u2, start: c } = D(), a = (f) => {
    c(), f.then(() => {
      const i = w$1(e), p = `<template async-id="${o}">${i}</template>`, l2 = `<script>__hydrateAsync("${o}");document.currentScript.remove();<\/script>`;
      r2.enqueue(s.encode(p)), r2.enqueue(s.encode(l2));
    }).catch((i) => {
      if (i instanceof Promise) c(), a(i);
      else throw i;
    }).finally(() => u2());
  };
  try {
    return w$1(e);
  } catch (f) {
    return f instanceof Promise && a(f), [`<!--~$:${o}-->`, (n == null ? void 0 : n()) ?? "", `<!--/$:${o}-->`];
  }
}
const N$1 = [];
function Ae() {
  return N$1[N$1.length - 1];
}
function se(e) {
  const { fallback: n = () => null, children: t } = e;
  if (W()) return Le({ fallback: n, children: t });
  if (y) return _e({ fallback: n, children: t });
  window.__SUSPENSE_DEFAULT_FALLBACK__ ?? (window.__SUSPENSE_DEFAULT_FALLBACK__ = []);
  const o = h$1(), r2 = o.suspenseID++, s = !!window.__SUSPENSE_DEFAULT_FALLBACK__[r2], u2 = x(s ? n : t);
  function c(a) {
    N$1.pop(), queueMicrotask(() => {
      u2.value = "__fromLazy" in a ? () => null : n;
    }), a.then(() => {
      u2.value = t;
    });
  }
  return !y && window.__SSR_STREAMING_APP__ ? u2.value = t : ce(() => {
    u2.value = t;
  }), () => (N$1.push(c), u2.value);
}
function ce(e) {
  if (!v().isHydrating) {
    e();
    return;
  }
  requestAnimationFrame(() => ce(e));
}
function xe(e) {
  if (e instanceof Node) return e;
  if (typeof e == "string" || typeof e == "number") {
    const { currentNode: n, next: t } = v();
    if (n instanceof Text && true) {
      if (n.textContent !== String(e)) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
      return t(), n;
    }
    return document.createTextNode(String(e));
  }
  throw new Error(`Unknown value: ${e}`);
}
function E$1(e, n, t = null) {
  if (!L(t) && !(t == null ? void 0 : t.parentNode)) return () => {
  };
  let o = [];
  for (const r2 of Q(U(n))) {
    let s = [], u2 = [];
    const c = R(`anchor-${r2}`, true);
    e.insertBefore(c, t);
    let a = null;
    const f = Ae(), i = C$1(() => {
      try {
        s.map((m2) => m2()), s = [];
        const l2 = typeof r2 == "function" ? r2() : r2;
        if (u2.push(() => a && J(a)), u2.push(() => a && a.remove()), L(l2)) a && (e.removeChild(a), a = null);
        else if (typeof l2 == "function") {
          const m2 = E$1(e, l2, c);
          s.push(m2);
        } else if (Array.isArray(l2)) {
          const m2 = E$1(e, l2, c);
          s.push(m2);
        } else {
          const m2 = xe(l2);
          a ? e.replaceChild(m2, a) : m2.isConnected ? (t && e.insertBefore(t, m2.nextElementSibling), e.insertBefore(c, m2.nextElementSibling)) : e.insertBefore(m2, c), a = m2;
        }
      } catch (l2) {
        if (l2 instanceof Promise && f) f(l2);
        else throw l2;
      }
    }), p = () => {
      for (const l2 of s) l2();
      for (const l2 of u2) l2();
      s = [], u2 = [], i(), c.remove();
    };
    o.push(p);
  }
  return () => {
    for (const r2 of o) r2();
    o = [];
  };
}
function ue({ children: e, target: n }) {
  let t;
  return Z(() => {
    const o = (n instanceof Function ? n() : n) ?? document.body;
    t = E$1(o, e);
  }), Y(() => {
    t();
  }), () => null;
}
const Ne = [se, fe, ue];
function ae(e, n = {}) {
  if (!Ne.includes(e)) for (const t in n) n[t] = n[t] instanceof Function ? n[t]() : n[t];
}
const B = /* @__PURE__ */ new WeakSet();
function z(e, n, t) {
  ae(e, n);
  const o = K(window.crypto.randomUUID());
  $$2(o);
  const r2 = R(`root-${e.name}`, true), s = X(() => e(t ? { ...n, children: t } : n)), u2 = U([r2, s]).flat();
  return $$2(null), Ee(r2, o), B.add(r2), u2;
}
function R(e, n = false) {
  let t;
  return process.env.NODE_ENV === "development" && !n ? t = document.createComment(e) : t = document.createTextNode(""), B.add(t), t;
}
const b$1 = /* @__PURE__ */ new WeakMap();
function Me(e, n, t) {
  let o = b$1.get(e);
  o || (o = /* @__PURE__ */ new Map(), b$1.set(e, o)), o.has(n) && e.removeEventListener(n, o.get(n)), e.addEventListener(n, t), o.set(n, t);
}
function be(e, n) {
  const t = b$1.get(e);
  if (!t) return;
  const o = t.get(n);
  o && (e.removeEventListener(n, o), t.delete(n)), t.size === 0 && b$1.delete(e);
}
function De(e, n) {
  const t = [];
  for (const o in n) {
    const r2 = () => {
      if (v().isHydrating) {
        requestAnimationFrame(r2);
        return;
      }
      const s = C$1(() => {
        const u2 = n[o], c = typeof u2 == "function" && o !== "ref" ? u2() : u2;
        if (o.startsWith("on") && e instanceof HTMLElement) {
          const f = o.slice(2).toLowerCase();
          return Me(e, f, c), () => be(e, f);
        }
        const a = e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement;
        if (o === "value" && a && typeof n.onInput != "function" && typeof n.onChange != "function") {
          e.value = c;
          const f = () => {
            e.value !== c && (e.value = c);
          };
          return e.setAttribute(o, c), e.addEventListener("input", f), () => e.removeEventListener("input", f);
        }
        if (o === "ref" && typeof c == "function") {
          c(e);
          return;
        }
        if (o === "style" && typeof c == "object" && e instanceof HTMLElement) {
          $e(e, c);
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
      t.push(s);
    };
    r2();
  }
  return () => {
    for (const o of t) o();
  };
}
function Te(e) {
  return CSS.supports(e, "0") && !CSS.supports(e, "0px");
}
function $e(e, n) {
  if (e instanceof HTMLElement) for (const t in n) {
    if (!Object.hasOwn(n, t)) continue;
    const o = n[t];
    if (o == null || t === "length" || t === "parentRule") continue;
    const r2 = typeof o == "number", s = r2 && !Te(t);
    e.style[t] = r2 ? s ? `${o}px` : `${o}` : String(o);
  }
}
function le(e, n = {}, t) {
  var _a;
  if (typeof e == "function") return z(e, n, t);
  if (e === "html") return t;
  _.push(((_a = n.xmlns) == null ? void 0 : _a.call(n)) ?? _[_.length - 1]);
  const o = ke(e), r2 = R("h-anchor", true);
  o.appendChild(r2);
  const s = E$1(o, t, r2), u2 = De(o, n);
  return queueMicrotask(() => {
    if (!o.parentNode) return;
    const c = new MutationObserver((a) => {
      for (const f of a) for (const i of f.removedNodes) o.isSameNode(i) && (s(), u2(), c.disconnect());
    });
    c.observe(o.parentNode, { childList: true, subtree: true });
  }), _.pop(), o;
}
const _ = [];
function ke(e) {
  const { currentNode: n, next: t } = v();
  if (n instanceof Element && true) {
    if (n.tagName.toLowerCase() !== e) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
    return t(), n;
  }
  const o = _[_.length - 1];
  return o ? document.createElementNS(o, e) : document.createElement(e);
}
function Ie(e, n) {
  let t = [];
  return () => {
    var _a;
    const o = e() || [], r2 = o.length, s = new Array(r2), u2 = /* @__PURE__ */ new Map();
    for (let i = 0; i < t.length; i++) {
      const p = t[i].value;
      u2.has(p) || u2.set(p, []), u2.get(p).push(i);
    }
    const c = new Array(r2).fill(-1);
    for (let i = 0; i < r2; i++) {
      const p = o[i], l2 = u2.get(p);
      if (l2 && l2.length) {
        const m2 = l2.shift();
        c[i] = m2, s[i] = t[m2];
      } else {
        const m2 = x(i), me = n(p, m2);
        s[i] = { value: p, index: m2, element: me };
      }
    }
    const a = He(c);
    let f = a.length - 1;
    for (let i = r2 - 1; i >= 0; i--) {
      const p = s[i];
      if (c[i] === -1 || i !== a[f]) {
        const l2 = i + 1 < r2 ? s[i + 1].element : null;
        (_a = p.element.parentNode) == null ? void 0 : _a.insertBefore(p.element, l2);
      } else f--;
      p.index.value = i;
    }
    return t = s, t.map((i) => i.element);
  };
}
function He(e) {
  const n = e.slice(), t = [];
  let o, r2;
  for (let s = 0; s < e.length; s++) {
    const u2 = e[s];
    if (!(u2 < 0)) {
      if (t.length === 0 || e[t[t.length - 1]] < u2) {
        n[s] = t.length > 0 ? t[t.length - 1] : -1, t.push(s);
        continue;
      }
      for (o = 0, r2 = t.length - 1; o < r2; ) {
        const c = (o + r2) / 2 | 0;
        e[t[c]] < u2 ? o = c + 1 : r2 = c;
      }
      u2 < e[t[o]] && (o > 0 && (n[s] = t[o - 1]), t[o] = s);
    }
  }
  for (o = t.length, r2 = t[o - 1]; o-- > 0; ) t[o] = r2, r2 = n[r2];
  return t;
}
function fe({ each: e, children: n }) {
  const t = x([]), o = Ie(e, n);
  return C$1(() => {
    t.value = o();
  }), () => t.value;
}
function E(t) {
  const e = ((r2) => {
    const i = h$1().memo;
    let o = i.get(e);
    return o || (o = { lastProps: void 0, hasLast: false, lastResult: void 0 }, i.set(e, o)), o.hasLast && h(o.lastProps, r2) || (o.lastProps = r2, o.lastResult = t(r2), o.hasLast = true), o.lastResult;
  });
  return e;
}
function h(t, e) {
  if (t === e || t !== t && e !== e) return true;
  if (t == null || e == null) return false;
  if (t instanceof Date && e instanceof Date) return t.getTime() === e.getTime();
  if (t instanceof RegExp && e instanceof RegExp) return t.toString() === e.toString();
  if (Array.isArray(t) && Array.isArray(e)) {
    if (t.length !== e.length) return false;
    for (let r2 = 0; r2 < t.length; r2++) if (!h(t[r2], e[r2])) return false;
    return true;
  }
  if (typeof t == "object" && typeof e == "object" && t.constructor === Object && e.constructor === Object) {
    const r2 = Object.keys(t), i = Object.keys(e);
    if (r2.length !== i.length) return false;
    for (const o of r2) if (!Object.prototype.hasOwnProperty.call(e, o) || !h(t[o], e[o])) return false;
    return true;
  }
  return false;
}
const $$1 = "lazy", j = "/lazy", M = (t, e = "default") => {
  let r2, i, o, a = null;
  const n = () => {
    if (i) try {
      return i;
    } finally {
      i = void 0;
    }
    throw o || (a = t().then(async (s) => {
      if (!(e in s)) throw new Error(`lazy(): Export "${String(e)}" not found in module`);
      i = (() => {
        const u2 = O[r2] || [];
        return ge([...v().renderedNodes, ...u2]), O[r2] = [], s[e]();
      });
    }).catch((s) => {
      o = s instanceof Error ? s : new Error(String(s));
    }), Object.assign(a, { __fromLazy: !v().isHydrating }));
  };
  return E(() => {
    if (r2 ?? (r2 = h$1().lazyID++), y && !W()) throw new Promise(() => {
    });
    const s = n()();
    return W() ? () => [`<!--${$$1}:${r2}-->`, s instanceof Function ? s() : s, `<!--${j}:${r2}-->`] : s;
  });
};
const w = /* @__PURE__ */ new WeakMap();
function N(t) {
  function e(r2) {
    if (w.has(r2)) return w.get(r2);
    const i = new Proxy(r2, { get(o, a, n) {
      ee(o, a);
      const s = Reflect.get(o, a, n);
      if (typeof s == "function") return s.bind(n);
      const u2 = Reflect.getOwnPropertyDescriptor(o, a);
      return (u2 == null ? void 0 : u2.get) ? u2.get.call(n) : typeof s == "object" && s !== null ? e(s) : s;
    }, set(o, a, n, s) {
      const u2 = o[a], l2 = Reflect.set(o, a, n, s);
      return u2 !== n && te(o, a), l2;
    } });
    return w.set(r2, i), i;
  }
  return e(t);
}
function k(t, e, r2 = true) {
  const i = D(), o = h$1(), a = o.resourceID++, n = N({ loading: true, error: null, data: void 0, promiseStatus: "pending" });
  let s = null;
  const u2 = () => {
    var _a;
    const l2 = e.map((c) => c());
    X(() => {
      n.loading = true, n.error = null, n.data = void 0, n.promiseStatus = "pending";
    }), !W() && !y && window.__resource && ((_a = window.__resource) == null ? void 0 : _a[a]) && r2 ? (X(() => {
      var _a2;
      n.data = (_a2 = window.__resource) == null ? void 0 : _a2[a], n.error = null, n.promiseStatus = "fulfilled", n.loading = false;
    }), delete window.__resource[a], window.__resource.length || delete window.__resource) : (s = X(() => t(...l2)), s.then((c) => {
      X(() => {
        n.data = c, n.error = null, n.promiseStatus = "fulfilled", n.loading = false;
      }), W() && r2 && i.controller.enqueue(i.encoder.encode(`<script>window.__resource ??= []; window.__resource[${a}] = ${JSON.stringify(c)};document.currentScript.remove();<\/script>`));
    }).catch((c) => {
      X(() => {
        n.data = void 0, n.error = c, n.promiseStatus = "rejected", n.loading = false;
      });
    }));
  };
  return C$1(() => {
    u2();
  }), { get loading() {
    return n.loading;
  }, get error() {
    return n.error;
  }, get data() {
    if (n.promiseStatus === "pending") throw s;
    if (n.promiseStatus === "rejected") throw n.error;
    return n.data;
  }, refetch: u2, mutate(l2) {
    n.data = l2;
  } };
}
function C() {
  let t;
  function e(i) {
    return t = i.value, i.children;
  }
  function r2() {
    if (!t) throw new Error("No provider found for context.");
    return t;
  }
  return [e, r2];
}
function A(t) {
  const e = x();
  return C$1(() => {
    e.value = t();
  }), { get value() {
    return e.value;
  } };
}
function u(n) {
  const e = [];
  for (const t in n) {
    if (t.startsWith("on") && typeof n[t] == "function") continue;
    const o = typeof n[t] == "function" ? n[t]() : n[t];
    if (t !== "ref" && t !== "style" && t !== "html") {
      if (typeof o == "boolean") {
        o && e.push(t);
        continue;
      }
      e.push(`${t}="${o}"`);
    }
  }
  return e.length > 0 && e.unshift(""), e.join(" ");
}
const $ = /* @__PURE__ */ new Set(["title", "meta", "script", "style"]);
function l(n, e) {
  const t = [];
  for (const o of Q(U(e))) {
    const s = typeof o == "function" ? o() : o;
    if (L(s)) continue;
    if (typeof s == "function" || Array.isArray(s)) {
      const f = l(n, s);
      L(f) || t.push(f);
      continue;
    }
    const i = re(s, $.has(n));
    L(i) || t.push(i);
  }
  for (const [o] of t.entries()) t[o] && t[o + 1] && oe(t[o]) && oe(t[o + 1]) && t.splice(o + 1, 0, "<!--split-->");
  return t.join("") || null;
}
const g = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
function b(n, e = {}, t) {
  if (typeof n == "function") {
    ae(n, e);
    const s = K(crypto.randomUUID());
    $$2(s);
    try {
      return n({ ...e, children: t }) || void 0;
    } finally {
      $$2(null), s.destroy.forEach((i) => i());
    }
  }
  if (g.has(n)) return `<${n}${u(e)}>`;
  const o = l(n, "html" in e ? e.html : t) || "";
  return `<${n}${u(e)}>${o}</${n}>`;
}
const m = (r2, { children: s, ...o } = {}) => y ? b(r2, o, s) : le(r2, o, s);
const isServer = typeof window === "undefined";
const $location = N({
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
  const star = routes2.find((r2) => r2.path.startsWith("*"));
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
const params = N({});
function Router({
  url,
  routes: routes2
}) {
  if (url) $location.pathname = url;
  return () => {
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
    return () => /* @__PURE__ */ m(r, {});
  };
}
const [OutletProvider, outletContext] = C();
function Outlet() {
  const Child = outletContext();
  return () => /* @__PURE__ */ m(Child, {});
}
function buildComponentTree(chain) {
  let Component2 = () => null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const route = chain[i];
    const Comp = route.component;
    const child = Component2;
    Component2 = () => /* @__PURE__ */ m(OutletProvider, {
      value: () => child,
      children: () => /* @__PURE__ */ m(Comp, {})
    });
  }
  return () => /* @__PURE__ */ m(Component2, {});
}
const Template = ({
  title,
  children
}) => {
  return () => /* @__PURE__ */ m("div", {
    class: () => "p-2 w-full",
    children: () => [() => /* @__PURE__ */ m("h1", {
      class: () => "font-bold text-2xl mb-2",
      children: () => title
    }), () => children()]
  });
};
const ButtonPageList = () => {
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Pages",
    children: () => /* @__PURE__ */ m("ul", {
      class: () => "flex flex-col gap-2",
      children: () => [() => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/"),
          disabled: () => isActiveRoute("/"),
          children: () => "All"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/lazy"),
          disabled: () => isActiveRoute("/lazy"),
          children: () => "Lazy"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/forms"),
          disabled: () => isActiveRoute("/forms"),
          children: () => "Forms"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/contexts"),
          disabled: () => isActiveRoute("/contexts"),
          children: () => "Contexts"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/dropdown-list"),
          disabled: () => isActiveRoute("/dropdown-list"),
          children: () => "Dropdown Lists"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/non-async-suspense"),
          disabled: () => isActiveRoute("/non-async-suspense"),
          children: () => "Non Async Suspense"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/stacked-suspense"),
          disabled: () => isActiveRoute("/stacked-suspense"),
          children: () => "Stacked Suspense"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/poke-dex"),
          disabled: () => isActiveRoute("/poke-dex"),
          children: () => "PokeDex List"
        })
      }), () => /* @__PURE__ */ m("li", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => navigate("/poke-dex-suspense"),
          disabled: () => isActiveRoute("/poke-dex-suspense"),
          children: () => "PokeDex List with Suspense"
        })
      })]
    })
  });
};
function Contexts() {
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Contexts",
    children: () => [() => /* @__PURE__ */ m(Form, {
      children: () => /* @__PURE__ */ m(Input$1, {})
    }), () => /* @__PURE__ */ m(Form, {
      children: () => /* @__PURE__ */ m(Wrapper, {
        children: () => /* @__PURE__ */ m(Input$1, {})
      })
    })]
  });
}
const [FormProvider, formContext] = C();
function Form({
  children
}) {
  const state = N({
    name: "asd"
  });
  return () => /* @__PURE__ */ m(FormProvider, {
    value: () => state,
    children: () => children()
  });
}
function Wrapper({
  children
}) {
  return () => /* @__PURE__ */ m(r, {
    children: () => [() => /* @__PURE__ */ m("div", {
      children: () => "Hi"
    }), () => " ", () => children()]
  });
}
const Input$1 = () => {
  const forms = formContext();
  const i = x(0);
  const nameEl = () => /* @__PURE__ */ m("div", {
    children: () => [() => "Name: ", () => forms.name, () => " Hi"]
  });
  console.log("hi");
  return () => /* @__PURE__ */ m(r, {
    children: () => [() => /* @__PURE__ */ m("div", {
      children: () => [() => "Name: ", () => forms.name]
    }), () => nameEl, () => /* @__PURE__ */ m("input", {
      type: () => "text",
      name: () => "name",
      onInput: () => (event) => forms.name = event.currentTarget.value,
      placeholder: () => "name",
      autoComplete: () => "off",
      value: () => forms.name
    }), " ", () => i.value]
  });
};
const name = N({
  firstName: "First name",
  lastName: "Last name"
});
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const Dropdowns = () => {
  console.log("Dropdown rerender");
  const dropdownStore = N({
    showDropdown: false,
    sortDirection: "asc",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8],
    handleSort() {
      this.numbers = [...this.numbers].sort((a, b2) => {
        return this.sortDirection === "desc" ? a - b2 : b2 - a;
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
      currentNumbers = currentNumbers.sort((a, b2) => a - b2);
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
  C$1(() => {
    console.log(dropdownStore.numbers);
  });
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Dropdown List",
    children: () => /* @__PURE__ */ m("div", {
      class: () => "flex flex-col gap-4",
      children: () => [() => /* @__PURE__ */ m("div", {
        children: () => /* @__PURE__ */ m("div", {
          class: () => "flex gap-2 items-center",
          children: () => [() => /* @__PURE__ */ m("span", {
            children: () => "Add Dropdown"
          }), () => /* @__PURE__ */ m("button", {
            class: () => "btn",
            onClick: () => dropdownStore.addDropdown,
            children: () => "+"
          }), () => /* @__PURE__ */ m("button", {
            class: () => "btn",
            onClick: () => dropdownStore.removeDropdown,
            children: () => "-"
          })]
        })
      }), () => /* @__PURE__ */ m("div", {
        class: () => "flex gap-2 items-center",
        children: () => [() => /* @__PURE__ */ m("span", {
          children: () => "Sort"
        }), () => /* @__PURE__ */ m("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleSort,
          children: () => dropdownStore.sortDirection === "asc" ? "↑" : "↓"
        }), () => /* @__PURE__ */ m("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleRandomize,
          children: () => "Randomize"
        })]
      }), () => /* @__PURE__ */ m("div", {
        children: () => /* @__PURE__ */ m("button", {
          onClick: () => () => dropdownStore.showDropdown = !dropdownStore.showDropdown,
          children: () => "Unmount Dropdown List"
        })
      }), () => dropdownStore.showDropdown && /* @__PURE__ */ m(DropdownList, {
        dropdowns: () => dropdownStore
      }), () => /* @__PURE__ */ m("div", {
        children: () => "Hi"
      })]
    })
  });
};
const DropdownList = ({
  dropdowns
}) => {
  console.log("weh");
  return () => /* @__PURE__ */ m("div", {
    class: () => "flex gap-2 flex-col lg:flex-row",
    children: () => dropdowns.numbers.map((number) => /* @__PURE__ */ m(Dropdown, {
      number: () => number
    }, () => number))
  });
};
const Dropdown = ({
  number
}) => {
  console.log("rerender");
  const isOpen = x(false);
  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };
  return () => /* @__PURE__ */ m(r, {
    children: () => /* @__PURE__ */ m("div", {
      class: () => "relative lg:w-[calc(100%/8)]",
      children: () => [() => /* @__PURE__ */ m("div", {
        children: () => [() => /* @__PURE__ */ m("button", {
          class: () => "btn w-full",
          onClick: () => handleToggle,
          children: () => [() => "Open Dropdown ", () => number]
        }), () => /* @__PURE__ */ m("div", {
          class: () => "break-all",
          children: () => [() => "Hi ", () => name.firstName]
        })]
      }), () => isOpen.value && /* @__PURE__ */ m("div", {
        class: () => "absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10",
        children: () => /* @__PURE__ */ m("ul", {
          children: () => Array.from({
            length: 3
          }).map((_2, i) => i + 1).map((item) => /* @__PURE__ */ m("li", {
            class: () => "cursor-pointer p-2 rounded hover:bg-gray-100",
            children: () => [() => "Dropdown ", () => item]
          }))
        })
      })]
    })
  });
};
const Forms = () => {
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Forms",
    children: () => /* @__PURE__ */ m("div", {
      children: () => [() => /* @__PURE__ */ m("div", {
        children: () => [() => /* @__PURE__ */ m("label", {
          class: () => "break-all",
          for: () => "name-input2",
          children: () => [() => "Hi ", () => name.firstName]
        }), () => /* @__PURE__ */ m("div", {
          children: () => /* @__PURE__ */ m("input", {
            type: () => "text",
            value: () => name.firstName,
            id: () => "name-input2"
          })
        })]
      }), () => /* @__PURE__ */ m("div", {
        children: () => [() => /* @__PURE__ */ m(Counter, {}), () => /* @__PURE__ */ m(Input, {})]
      })]
    })
  });
};
const Counter = () => {
  const count = x(0);
  const double = A(() => count.value * 2);
  const handleCount = () => {
    count.value++;
  };
  C$1(() => {
  });
  C$1(() => {
  });
  console.log("rerender?");
  return () => /* @__PURE__ */ m(r, {
    children: () => [() => count.value, () => /* @__PURE__ */ m("div", {
      children: () => [() => "Count: ", () => count.value]
    }), () => /* @__PURE__ */ m("div", {
      children: () => [() => "Double Count: ", () => double.value]
    }), () => /* @__PURE__ */ m("button", {
      disabled: () => count.value >= 5,
      onClick: () => handleCount,
      children: () => "Add counter"
    }), () => /* @__PURE__ */ m("div", {
      children: () => count.value <= 3 ? /* @__PURE__ */ m("div", {
        children: () => "Hi"
      }) : "string"
    })]
  });
};
const Input = () => {
  return () => /* @__PURE__ */ m("div", {
    children: () => [() => /* @__PURE__ */ m("label", {
      class: () => "break-all",
      for: () => "name-input",
      children: () => [() => "Name ", () => name.firstName, () => " ", () => /* @__PURE__ */ m("span", {
        children: () => "Hi"
      })]
    }), () => /* @__PURE__ */ m("div", {
      children: () => /* @__PURE__ */ m("input", {
        id: () => "name-input",
        type: () => "text",
        onInput: () => (event) => {
          name.firstName = event.currentTarget.value;
        },
        value: () => name.firstName
      })
    })]
  });
};
const LazyImport = M(() => import("./assets/LazyImport-eMnSqWjI.js"), "LazyImport");
const LazyTest = M(() => import("./assets/Test-D6b9mNWF.js"), "Test");
const Lazy = () => {
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Lazy",
    children: () => /* @__PURE__ */ m("div", {
      children: () => [() => /* @__PURE__ */ m(se, {
        fallback: () => "Tester",
        children: () => /* @__PURE__ */ m(LazyImport, {})
      }), () => /* @__PURE__ */ m(se, {
        fallback: () => "Tester2",
        children: () => /* @__PURE__ */ m(LazyTest, {})
      }), () => /* @__PURE__ */ m("h5", {
        children: () => "Test"
      })]
    })
  });
};
function NonAsyncSuspense() {
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Non-Async Suspense",
    children: () => /* @__PURE__ */ m("div", {
      children: () => /* @__PURE__ */ m(se, {
        fallback: () => /* @__PURE__ */ m("div", {
          children: () => "hi"
        }),
        children: () => /* @__PURE__ */ m("div", {
          children: () => "Children"
        })
      })
    })
  });
}
const PokeDex = E(() => {
  const pokeDex = N({
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
      this.pokeDexList = [...this.pokeDexList].sort((a, b2) => {
        const cmp = a[key].localeCompare(b2[key]);
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
  return () => /* @__PURE__ */ m(Template, {
    title: () => "PokeDex List",
    children: () => [() => /* @__PURE__ */ m("div", {
      class: () => "break-all",
      children: () => [() => "Hi ", () => name.firstName]
    }), () => /* @__PURE__ */ m("table", {
      class: () => "w-full mx-auto my-2 table-fixed",
      children: () => [() => /* @__PURE__ */ m("thead", {
        children: () => /* @__PURE__ */ m("tr", {
          children: () => [() => /* @__PURE__ */ m("th", {
            class: () => "w-1/3",
            children: () => "ID"
          }), () => /* @__PURE__ */ m("th", {
            onClick: () => sortOnClick("name"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "Name"
          }), () => /* @__PURE__ */ m("th", {
            onClick: () => sortOnClick("url"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "URL"
          })]
        })
      }), () => /* @__PURE__ */ m("tbody", {
        children: () => [() => pokeDex.isLoading && /* @__PURE__ */ m(r, {
          children: () => Array.from({
            length: 20
          }).map((_2, i) => i + 1).map((number) => /* @__PURE__ */ m("tr", {
            children: () => /* @__PURE__ */ m("td", {
              colSpan: () => 3,
              class: () => "h-[24px] text-center",
              children: () => number === 10 && "loading..."
            })
          }))
        }), () => !pokeDex.isLoading && /* @__PURE__ */ m(r, {
          children: () => pokeDex.pokeDexList.map(({
            name: name2,
            url
          }, index) => /* @__PURE__ */ m("tr", {
            children: () => [() => /* @__PURE__ */ m("td", {
              class: () => "w-1/3 text-center",
              children: () => index + 1
            }), () => /* @__PURE__ */ m("td", {
              class: () => "w-1/3 text-center truncate",
              children: () => name2
            }), () => /* @__PURE__ */ m("td", {
              class: () => "w-1/3 text-center truncate",
              onClick: () => showUrlOnClick(url),
              children: () => url
            })]
          }))
        })]
      })]
    }), () => /* @__PURE__ */ m("div", {
      class: () => "flex gap-4 justify-center",
      children: () => [() => /* @__PURE__ */ m("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.prevLink),
        disabled: () => pokeDex.isLoading || !pokeDex.prevLink,
        children: () => "Previous"
      }), () => /* @__PURE__ */ m("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.nextLink),
        disabled: () => pokeDex.isLoading || !pokeDex.nextLink,
        children: () => "Next"
      })]
    })]
  });
});
const PokeDexSuspense = () => {
  const pokeDex = N({
    url: "https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20",
    sortDirection: "asc",
    sort(key) {
      if (!pokeDexResource.data) return;
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
      pokeDexResource.mutate({
        ...pokeDexResource.data,
        results: [...pokeDexResource.data.results].sort((a, b2) => {
          const cmp = a[key].localeCompare(b2[key]);
          return this.sortDirection === "asc" ? cmp : -cmp;
        })
      });
    },
    changeUrl(newUrl) {
      if (pokeDexResource.loading || !newUrl) return;
      this.url = newUrl.replace(/limit=\d+/, "limit=20");
    }
  });
  const pokeDexResource = k(async (url) => {
    const response = await fetch(url);
    const json = await response.json();
    return json;
  }, [() => pokeDex.url]);
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.sort(key);
  Y(() => {
    console.log("pokedex-suspense destroyed");
  });
  return () => /* @__PURE__ */ m(Template, {
    title: () => "PokeDex List (via Suspense)",
    children: () => /* @__PURE__ */ m("div", {
      children: () => [() => /* @__PURE__ */ m("div", {
        class: () => "break-all",
        children: () => [() => "Hi ", () => name.firstName]
      }), () => /* @__PURE__ */ m("table", {
        class: () => "w-full mx-auto my-2 table-fixed",
        children: () => [() => /* @__PURE__ */ m("thead", {
          children: () => /* @__PURE__ */ m("tr", {
            children: () => [() => /* @__PURE__ */ m("th", {
              class: () => "w-1/3",
              children: () => "ID"
            }), () => /* @__PURE__ */ m("th", {
              onClick: () => sortOnClick("name"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "Name"
            }), () => /* @__PURE__ */ m("th", {
              onClick: () => sortOnClick("url"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "URL"
            })]
          })
        }), () => /* @__PURE__ */ m("tbody", {
          children: () => /* @__PURE__ */ m(se, {
            fallback: () => /* @__PURE__ */ m(r, {
              children: () => Array.from({
                length: 20
              }).map((_2, i) => i + 1).map((number) => /* @__PURE__ */ m("tr", {
                children: () => /* @__PURE__ */ m("td", {
                  colSpan: () => 3,
                  class: () => "h-[24px] text-center",
                  children: () => number === 10 && "loading..."
                })
              }))
            }),
            children: () => /* @__PURE__ */ m(r, {
              children: () => pokeDexResource.data.results.map(({
                name: name2,
                url
              }, index) => /* @__PURE__ */ m("tr", {
                children: () => [() => /* @__PURE__ */ m("td", {
                  class: () => "w-1/3 text-center",
                  children: () => index + 1
                }), () => /* @__PURE__ */ m("td", {
                  class: () => "w-1/3 text-center truncate",
                  children: () => name2
                }), () => /* @__PURE__ */ m("td", {
                  class: () => "w-1/3 text-center truncate",
                  onClick: () => showUrlOnClick(url),
                  children: () => url
                })]
              }))
            })
          })
        })]
      }), () => /* @__PURE__ */ m("div", {
        class: () => "flex gap-4 justify-center",
        children: () => [() => /* @__PURE__ */ m("button", {
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
        }), () => /* @__PURE__ */ m("button", {
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
const StackedSuspense = E(() => {
  const msg3 = k(async () => {
    await sleep(2e3);
    return "hello world 3";
  }, []);
  const msg2 = k(async () => {
    await sleep(2e3);
    return "hello world 2";
  }, []);
  console.log("suspense parent rerender");
  return () => /* @__PURE__ */ m(Template, {
    title: () => "Stacked Suspense",
    children: () => /* @__PURE__ */ m("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ m(se, {
        fallback: () => "Lick my ass",
        children: () => /* @__PURE__ */ m("input", {
          onInput: () => (event) => {
            msg2.mutate(event.currentTarget.value.toString());
          },
          value: () => msg2.data
        })
      }), () => /* @__PURE__ */ m(se, {
        fallback: () => "Ngee",
        children: () => msg3.data
      }), () => /* @__PURE__ */ m(se, {
        fallback: () => /* @__PURE__ */ m("div", {
          children: () => "loading 1..."
        }),
        children: () => [() => /* @__PURE__ */ m(Component, {}), () => /* @__PURE__ */ m(se, {
          fallback: () => /* @__PURE__ */ m("div", {
            children: () => "loading 2..."
          }),
          children: () => msg2.data
        }), () => /* @__PURE__ */ m("div", {
          children: () => "hi"
        })]
      })]
    })
  });
});
const Component = E(() => {
  const msg = k(async () => {
    await sleep(1e3);
    return `hello world`;
  }, []);
  console.log("suspense inner rerender");
  return () => /* @__PURE__ */ m("div", {
    children: () => msg.data
  });
});
const routes = [{
  path: "/",
  component: () => {
    return () => /* @__PURE__ */ m("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ m(ButtonPageList, {}), () => /* @__PURE__ */ m(Outlet, {})]
    });
  },
  children: [{
    path: "/",
    component: () => /* @__PURE__ */ m(r, {
      children: () => [() => /* @__PURE__ */ m(Lazy, {}), () => /* @__PURE__ */ m(Forms, {}), () => /* @__PURE__ */ m(Contexts, {}), () => /* @__PURE__ */ m(Dropdowns, {}), () => /* @__PURE__ */ m(NonAsyncSuspense, {}), () => /* @__PURE__ */ m(StackedSuspense, {}), () => /* @__PURE__ */ m(PokeDex, {}), () => /* @__PURE__ */ m(PokeDexSuspense, {})]
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
  return () => /* @__PURE__ */ m(r, {
    children: () => /* @__PURE__ */ m(Router, {
      url: () => url,
      routes: () => routes
    })
  });
}
function T(c) {
  return he(true), de(), new ReadableStream({ async start(r2) {
    const o = new AsyncLocalStorage(), s = new TextEncoder(), n = x(0);
    globalThis.__stream_context = { encoder: s, controller: r2, start: () => n.value++, end: () => n.value-- }, o.run(globalThis.__stream_context, () => {
      const a = o.getStore();
      globalThis.__stream_context = a;
      try {
        const t = w$1(c()) || "";
        r2.enqueue(s.encode(t));
      } catch (t) {
        console.error("renderToStream error:", t);
      }
    }), C$1(() => {
      n.value <= 0 && queueMicrotask(() => {
        n.value <= 0 && r2.close();
      });
    });
  } });
}
const render = (url) => {
  return T(() => /* @__PURE__ */ m(App, {
    url: () => url
  }));
};
export {
  C$1 as C,
  E,
  M,
  Z,
  C as a,
  m,
  r,
  render,
  se as s,
  x
};
