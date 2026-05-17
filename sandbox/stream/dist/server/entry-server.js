import { AsyncLocalStorage } from "async_hooks";
function r({ children: n }) {
  return n;
}
const p = typeof window > "u";
let T = false;
const de = (e) => T = e, D = () => (globalThis.__stream_context ?? (globalThis.__stream_context = {}), globalThis.__stream_context), y$1 = /* @__PURE__ */ new Map(), j$1 = () => {
  let e;
  if (!p) y$1.has(window) || y$1.set(window, { suspenseID: 0, resourceID: 0, lazyID: 0, stateID: 0, memo: /* @__PURE__ */ new Map() }), e = y$1.get(window);
  else {
    const n = D();
    y$1.has(n) || y$1.set(n, { suspenseID: 0, resourceID: 0, lazyID: 0, stateID: 0, memo: /* @__PURE__ */ new Map() }), e = y$1.get(n);
  }
  if (!e) throw new Error("[vynn]: context does not exists");
  return e;
};
let B = null;
function H(e) {
  B = e;
}
function C$1() {
  return B;
}
let l$1 = null;
function U(e) {
  l$1 = e;
}
const I$1 = /* @__PURE__ */ new Set();
let _$2 = false;
function me(e) {
  I$1.add(e), _$2 || (_$2 = true, queueMicrotask(() => {
    for (const n of I$1) n();
    I$1.clear(), _$2 = false;
  }));
}
function L$1(e) {
  const n = C$1(), t = async () => {
    k(t), t.cleanup && (t.cleanup(), t.cleanup = void 0);
    const r2 = l$1;
    l$1 = t, n && n.effect.push(t);
    try {
      const s = e();
      if (typeof s == "function") t.cleanup = s;
      else if (s instanceof Promise) {
        const i = await s;
        typeof i == "function" && (t.cleanup = i);
      }
    } finally {
      l$1 = r2;
    }
  }, o = () => k(t);
  return t.deps = [], t(), o;
}
function k(e) {
  if (e.deps) {
    for (const n of e.deps) n.delete(e);
    e.deps.length = 0;
  }
  e.cleanup && (e.cleanup(), e.cleanup = void 0);
}
const P$1 = /* @__PURE__ */ new WeakMap();
function G(e, n) {
  if (!l$1) return;
  let t = P$1.get(e);
  t || (t = /* @__PURE__ */ new Map(), P$1.set(e, t));
  let o = t.get(n);
  o || (o = /* @__PURE__ */ new Set(), t.set(n, o)), o.has(l$1) || (o.add(l$1), l$1.deps ? l$1.deps.push(o) : l$1.deps = [o]);
}
function J(e, n) {
  const t = P$1.get(e);
  if (!t) return;
  const o = t.get(n);
  if (o) for (const r2 of o) me(r2);
}
function A(e) {
  const n = C$1();
  if (n && n.state) {
    const { states: t, index: o } = n.state;
    if (t.length <= o) {
      const r2 = V(e);
      t.push(r2);
    }
    return t[n.state.index++];
  }
  return V(e);
}
function V(e) {
  const n = { value: e };
  return new Proxy(n, { get(t, o, r2) {
    return G(t, o), Reflect.get(t, o, r2);
  }, set(t, o, r2, s) {
    const i = t[o], c = Reflect.set(t, o, r2, s);
    return i !== r2 && J(t, o), c;
  } });
}
const E$1 = (e) => e == null || e === false;
function pe(e) {
  return !/<[^>]+>/g.test(e);
}
function X(e, n = false) {
  if (E$1(e)) return null;
  if (typeof e == "string" || typeof e == "number") {
    let t = String(e);
    return pe(t) && !n && (t = `<!--!-->${t}<!--/-->`), t;
  }
  throw new Error(`Unknown value: ${e}`);
}
function N$1(e) {
  return E$1(e) ? null : typeof e == "function" ? N$1(e()) : Array.isArray(e) ? e.map(N$1).join("") || null : X(e);
}
let g$1 = [], v = 0;
function w() {
  return { renderedNodes: g$1, get currentNode() {
    if (!p) return g$1[v];
  }, get isHydrating() {
    return !!g$1[v];
  }, next: () => {
    g$1[v] && v++;
  }, prev: () => {
    g$1[v] && v--;
  } };
}
function he(e, n) {
  g$1 = e;
}
let K = [];
const b = [];
function Q() {
  return b[b.length - 1];
}
function Y(e) {
  const { fallback: n = () => null, children: t } = e;
  if (T) return ge(n, t);
  if (p) return n == null ? void 0 : n();
  const o = A(n), r2 = (s) => {
    b.pop(), o.value = n, s.then(() => {
      o.value = t;
    });
  };
  return !p && window.__SSR_STREAMING_APP__ ? o.value = t : Z(() => {
    o.value = t;
  }), () => (b.push(r2), o.value);
}
function Z(e) {
  if (!w().isHydrating) {
    e();
    return;
  }
  requestAnimationFrame(() => Z(e));
}
function ge(e, n) {
  const t = j$1(), o = t.suspenseID++, r2 = D(), s = (i) => {
    i.then(() => {
      const c = N$1(n), f = `<template async-id="${o}">${c}</template>`, m2 = `<script>__hydrateAsync("${o}");document.currentScript.remove();<\/script>`;
      r2.controller.enqueue(r2.encoder.encode(f)), r2.controller.enqueue(r2.encoder.encode(m2)), r2.end(), r2.tryClose();
    }).catch((c) => {
      if (c instanceof Promise) {
        s(c);
        return;
      }
      console.error("[vynn]: Suspense promise rejected:", c);
    });
  };
  try {
    return N$1(n);
  } catch (i) {
    return i instanceof Promise && (r2.start(), s(i)), [`<!--~$:${o}-->`, (e == null ? void 0 : e()) ?? "", `<!--/$:${o}-->`];
  }
}
const q = /* @__PURE__ */ new Map();
function ve(e, n) {
  q.set(e, n);
}
function F$1(e) {
  const n = q.get(e);
  if (n) {
    for (const t of n) t();
    q.delete(e);
  }
  if (e instanceof HTMLElement) for (const t of e.childNodes) F$1(t);
}
const we = (e) => {
  let n;
  return n = { states: [] }, { ...n, index: 0 };
};
function ee(e) {
  return { mount: [], state: we(), effect: [], destroy: [] };
}
function Se(e, n) {
  if (!n) return;
  const t = [];
  ve(e, t);
  const o = async () => {
    for (const r2 of n.mount) {
      const s = await r2();
      s && t.push(s);
    }
    for (const r2 of n.destroy) t.push(r2);
    for (const r2 of n.effect) t.push(() => Promise.resolve(k(r2)));
  };
  te(() => {
    queueMicrotask(() => Promise.resolve().then(o));
  });
}
function te(e) {
  if (!w().isHydrating) {
    e();
    return;
  }
  requestAnimationFrame(() => te(e));
}
function ne(e) {
  const n = l$1;
  U(null);
  try {
    return e();
  } finally {
    U(n);
  }
}
const R$1 = (e) => (Array.isArray(e) ? e : [e]).flat(1 / 0), $$1 = /* @__PURE__ */ new WeakMap();
function Ne(e, n, t) {
  let o = $$1.get(e);
  o || (o = /* @__PURE__ */ new Map(), $$1.set(e, o)), o.has(n) && e.removeEventListener(n, o.get(n)), e.addEventListener(n, t), o.set(n, t);
}
function xe(e, n) {
  const t = $$1.get(e);
  if (!t) return;
  const o = t.get(n);
  o && (e.removeEventListener(n, o), t.delete(n)), t.size === 0 && $$1.delete(e);
}
function Me(e, n) {
  for (const t in n) {
    const o = () => {
      if (w().isHydrating) {
        requestAnimationFrame(o);
        return;
      }
      L$1(() => {
        const r2 = n[t], s = typeof r2 == "function" && t !== "ref" ? r2() : r2;
        if (t.startsWith("on") && e instanceof HTMLElement) {
          const c = t.slice(2).toLowerCase();
          return Ne(e, c, s), () => xe(e, c);
        }
        const i = e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement;
        if (t === "value" && i && typeof n.onInput != "function" && typeof n.onChange != "function") {
          e.value = s;
          const c = () => {
            e.value !== s && (e.value = s);
          };
          return e.setAttribute(t, s), e.addEventListener("input", c), () => e.removeEventListener("input", c);
        }
        if (t === "ref" && typeof s == "function") {
          s(e);
          return;
        }
        if (t === "style" && typeof s == "object" && e instanceof HTMLElement) {
          Le(e, s);
          return;
        }
        if (typeof s == "boolean") {
          e.toggleAttribute(t, s);
          return;
        }
        if (t === "html" && typeof s == "string") {
          e.innerHTML = s;
          return;
        }
        e.setAttribute(t, s);
      });
    };
    o();
  }
}
function Ce(e) {
  return CSS.supports(e, "0") && !CSS.supports(e, "0px");
}
function Le(e, n) {
  if (e instanceof HTMLElement) for (const t in n) {
    if (!Object.hasOwn(n, t)) continue;
    const o = n[t];
    if (o == null || t === "length" || t === "parentRule") continue;
    const r2 = typeof o == "number", s = r2 && !Ce(t);
    e.style[t] = r2 ? s ? `${o}px` : `${o}` : String(o);
  }
}
function oe(e, n = {}, t, o) {
  var _a;
  if (typeof e == "function") return W(e, n, t);
  if (e === "html") return t;
  S$2.push(((_a = n.xmlns) == null ? void 0 : _a.call(n)) ?? S$2[S$2.length - 1]);
  const r2 = Ae(e), s = ae("base-anchor", true);
  r2.appendChild(s);
  const i = x(r2, t, s);
  return Me(r2, n), queueMicrotask(() => {
    if (!r2.parentNode) return;
    const c = new MutationObserver((f) => {
      for (const m2 of f) for (const u of m2.removedNodes) r2.isSameNode(u) && (i(), s.remove(), c.disconnect());
    });
    c.observe(r2.parentNode, { childList: true });
  }), S$2.pop(), r2;
}
const S$2 = [];
function Ae(e) {
  const { currentNode: n, next: t } = w();
  if (n instanceof Element && true) return n.tagName.toLowerCase() !== e && console.error("Hydration mismatch because the initial UI does not match what was rendered on the server"), t(), n;
  const o = S$2[S$2.length - 1];
  return o ? document.createElementNS(o, e) : document.createElement(e);
}
function be(e, n) {
  let t = [];
  return () => {
    var _a;
    const o = e() || [], r2 = o.length, s = new Array(r2), i = /* @__PURE__ */ new Map();
    for (let u = 0; u < t.length; u++) {
      const a2 = t[u].value;
      i.has(a2) || i.set(a2, []), i.get(a2).push(u);
    }
    const c = new Array(r2).fill(-1);
    for (let u = 0; u < r2; u++) {
      const a2 = o[u], d = i.get(a2);
      if (d && d.length) {
        const h = d.shift();
        c[u] = h, s[u] = t[h];
      } else {
        const h = A(u), le = n(a2, h);
        s[u] = { value: a2, index: h, element: le };
      }
    }
    const f = $e(c);
    let m2 = f.length - 1;
    for (let u = r2 - 1; u >= 0; u--) {
      const a2 = s[u];
      if (c[u] === -1 || u !== f[m2]) {
        const d = u + 1 < r2 ? s[u + 1].element : null;
        (_a = a2.element.parentNode) == null ? void 0 : _a.insertBefore(a2.element, d);
      } else m2--;
      a2.index.value = u;
    }
    return t = s, t.map((u) => u.element);
  };
}
function $e(e) {
  const n = e.slice(), t = [];
  let o, r2;
  for (let s = 0; s < e.length; s++) {
    const i = e[s];
    if (!(i < 0)) {
      if (t.length === 0 || e[t[t.length - 1]] < i) {
        n[s] = t.length > 0 ? t[t.length - 1] : -1, t.push(s);
        continue;
      }
      for (o = 0, r2 = t.length - 1; o < r2; ) {
        const c = (o + r2) / 2 | 0;
        e[t[c]] < i ? o = c + 1 : r2 = c;
      }
      i < e[t[o]] && (o > 0 && (n[s] = t[o - 1]), t[o] = s);
    }
  }
  for (o = t.length, r2 = t[o - 1]; o-- > 0; ) t[o] = r2, r2 = n[r2];
  return t;
}
function Te(e) {
  return { each(n) {
    const t = e;
    return n = n, p ? t().map((o, r2) => n(o, { value: r2 })) : oe(re, { each: t, children: n });
  } };
}
function re({ each: e, children: n }) {
  const t = A([]), o = Q(), r2 = be(e, n);
  return L$1(() => {
    try {
      t.value = r2();
    } catch (s) {
      if (s instanceof Promise && o) o(s);
      else throw s;
    }
  }), () => t.value;
}
function se(e) {
  const n = C$1();
  if (!n) throw new Error("onDestroy called outside of component");
  n.destroy.push(e);
}
function ce(e) {
  if (p) return;
  const n = C$1();
  if (!n) throw new Error("onMount called outside of component");
  n.mount.push(e);
}
function ie({ children: e, target: n }) {
  let t;
  return ce(() => {
    const o = (n instanceof Function ? n() : n) ?? document.body;
    t = x(o, e);
  }), se(() => {
    t();
  }), () => null;
}
const De = [Y, re, ie];
function ue(e, n = {}) {
  if (!De.includes(e)) for (const t in n) n[t] = n[t] instanceof Function ? n[t]() : n[t];
}
const O = /* @__PURE__ */ new WeakSet();
function W(e, n, t, o) {
  ue(e, n);
  const s = ee();
  H(s);
  const i = document.createTextNode(""), c = ne(() => e(t ? { ...n, children: t } : n)), f = R$1([i, c]).flat();
  return H(null), Se(i, s), O.add(i), f;
}
queueMicrotask(() => {
  p || new MutationObserver((e) => {
    for (const n of e) for (const t of n.removedNodes) F$1(t);
  }).observe(document.body, { childList: true, subtree: true });
});
function ae(e, n = false) {
  let t;
  return process.env.NODE_ENV === "development" && !n ? t = document.createComment(e) : t = document.createTextNode(""), O.add(t), t;
}
function He(e) {
  if (e instanceof Node) return e;
  if (typeof e == "string" || typeof e == "number") {
    const { currentNode: n, next: t } = w();
    if (n instanceof Text && true) {
      if (n.textContent !== String(e)) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
      return t(), n;
    }
    return document.createTextNode(String(e));
  }
  throw new Error(`Unknown value: ${e}`);
}
function x(e, n, t = null) {
  if (!E$1(t) && !(t == null ? void 0 : t.parentNode)) return () => {
  };
  let o = [];
  for (const r2 of R$1(n)) {
    let s = [], i = [];
    const c = ae("anchor", true);
    e.insertBefore(c, t);
    const f = () => {
      for (const a2 of s) a2 == null ? void 0 : a2();
      s = [];
      for (const a2 of i) a2();
      i = [];
    }, m2 = Q(), u = L$1(() => {
      try {
        f();
        const a2 = typeof r2 == "function" ? r2() : r2;
        if (E$1(a2)) return;
        if (typeof a2 == "function" || Array.isArray(a2)) {
          const h = x(e, a2, c);
          s.push(h);
          return;
        }
        const d = He(a2);
        e.insertBefore(d, c), i.push(() => {
          F$1(d), d.parentNode === e && e.removeChild(d);
        });
      } catch (a2) {
        if (a2 instanceof Promise && m2) m2(a2);
        else throw a2;
      }
    });
    o.push(() => {
      f(), c.parentNode === e && c.remove();
    }), o.push(u);
  }
  return () => {
    for (const r2 of o) r2();
    o = [];
  };
}
function S$1(r2) {
  const e = ((n) => {
    const o = j$1().memo;
    let t = o.get(e);
    return t || (t = { lastProps: void 0, hasLast: false, lastResult: void 0 }, o.set(e, t)), t.hasLast && m(t.lastProps, n) || (t.lastProps = n, t.lastResult = r2(n), t.hasLast = true), t.lastResult;
  });
  return e;
}
function m(r2, e) {
  if (r2 === e || r2 !== r2 && e !== e) return true;
  if (r2 == null || e == null) return false;
  if (r2 instanceof Date && e instanceof Date) return r2.getTime() === e.getTime();
  if (r2 instanceof RegExp && e instanceof RegExp) return r2.toString() === e.toString();
  if (Array.isArray(r2) && Array.isArray(e)) {
    if (r2.length !== e.length) return false;
    for (let n = 0; n < r2.length; n++) if (!m(r2[n], e[n])) return false;
    return true;
  }
  if (typeof r2 == "object" && typeof e == "object" && r2.constructor === Object && e.constructor === Object) {
    const n = Object.keys(r2), o = Object.keys(e);
    if (n.length !== o.length) return false;
    for (const t of n) if (!Object.prototype.hasOwnProperty.call(e, t) || !m(r2[t], e[t])) return false;
    return true;
  }
  return false;
}
const j = "lazy", R = "/lazy";
let _$1 = false;
const P = (r2, e = "default") => {
  _$1 || (console.warn("[vynn]: lazy() is still experimental so expect flickers"), _$1 = true);
  const n = r2(), o = j$1().lazyID++;
  let t, i, a2 = null;
  const u = () => {
    if (t) return t;
    if (i) throw i;
    if (!T && w().isHydrating && window.__SSR_STREAMING_APP__ && true) {
      const s = K[o];
      throw he([...w().renderedNodes, ...s]), a2 = n.then((l2) => {
        if (!(e in l2)) throw new Error(`lazy(): Export "${String(e)}" not found in module`);
        t = l2[e];
      }), a2;
    }
    throw a2 || (a2 = n.then((s) => {
      if (!(e in s)) throw new Error(`lazy(): Export "${String(e)}" not found in module`);
      t = s[e];
    }).catch((s) => {
      i = s instanceof Error ? s : new Error(String(s));
    })), a2;
  };
  return S$1(() => {
    const s = u()();
    return T ? () => [`<!--${j}:${o}-->`, s instanceof Function ? s() : s, `<!--${R}:${o}-->`] : (globalThis.__lazy++, s);
  });
};
const y = /* @__PURE__ */ new WeakMap();
function E(r2) {
  function e(n) {
    if (y.has(n)) return y.get(n);
    const o = new Proxy(n, { get(t, i, a2) {
      G(t, i);
      const u = Reflect.get(t, i, a2);
      if (typeof u == "function") return u.bind(a2);
      const s = Reflect.getOwnPropertyDescriptor(t, i);
      return (s == null ? void 0 : s.get) ? s.get.call(a2) : typeof u == "object" && u !== null ? e(u) : u;
    }, set(t, i, a2, u) {
      const s = t[i], l2 = Reflect.set(t, i, a2, u);
      return s !== a2 && J(t, i), l2;
    } });
    return y.set(n, o), o;
  }
  return e(r2);
}
function I(r2, e) {
  const n = j$1(), o = n.resourceID++, t = E({ loading: true, error: null, data: void 0, promiseStatus: "pending" });
  let i = null;
  const a2 = () => {
    const u = e.map((s) => s());
    ne(() => {
      t.loading = true, t.error = null, t.data = void 0, t.promiseStatus = "pending";
    }), !T && !p && window.__resource && window.__resource[o] ? (ne(() => {
      t.data = window.__resource[o], t.error = null, t.promiseStatus = "fulfilled", t.loading = false;
    }), delete window.__resource[o], window.__resource.length || delete window.__resource) : (i = ne(() => r2(...u)), i.then((s) => {
      if (ne(() => {
        t.data = s, t.error = null, t.promiseStatus = "fulfilled", t.loading = false;
      }), T) {
        const { controller: l2, encoder: b2 } = D();
        l2.enqueue(b2.encode(`<script>window.__resource ??= []; window.__resource[${o}] = ${JSON.stringify(s)};document.currentScript.remove();<\/script>`));
      }
    }).catch((s) => {
      ne(() => {
        t.data = void 0, t.error = s, t.promiseStatus = "rejected", t.loading = false;
      });
    }));
  };
  return L$1(() => {
    a2();
  }), { get loading() {
    return t.loading;
  }, get error() {
    return t.error;
  }, get data() {
    if (t.promiseStatus === "pending") throw i;
    if (t.promiseStatus === "rejected") throw t.error;
    return t.data;
  }, refetch: a2, mutate(u) {
    t.data = u;
  } };
}
const N = /* @__PURE__ */ new WeakMap();
function L() {
  const r2 = Symbol("context");
  function e(o) {
    return N.set(r2, o.value), o.children();
  }
  function n() {
    const o = N.get(r2);
    if (!o) throw new Error("No provider found for context.");
    return o;
  }
  return [e, n];
}
function F(r2) {
  const e = A();
  return L$1(() => {
    e.value = r2();
  }), { get value() {
    return e.value;
  } };
}
function l(n) {
  const o = [];
  for (const t in n) {
    if (t.startsWith("on") && typeof n[t] == "function") continue;
    const e = typeof n[t] == "function" ? n[t]() : n[t];
    if (t !== "ref" && t !== "style" && t !== "html") {
      if (typeof e == "boolean") {
        e && o.push(t);
        continue;
      }
      o.push(`${t}="${e}"`);
    }
  }
  return o.length > 0 && o.unshift(""), o.join(" ");
}
const g = /* @__PURE__ */ new Set(["title", "meta", "script", "style"]);
function $(n, o) {
  function t(e) {
    const s = [], c = e instanceof Function ? e() : e, f = R$1(c);
    for (const i of f) if (!E$1(i)) if (typeof i == "function") {
      const r2 = t(i);
      E$1(r2) || s.push(r2);
    } else {
      const r2 = X(i, g.has(n));
      E$1(r2) || s.push(r2);
    }
    return s.join("") || null;
  }
  return t(o);
}
const C = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
function S(n, o = {}, t, e) {
  if (typeof n == "function") {
    ue(n, o);
    const f = ee();
    H(f);
    try {
      return N$1(n({ ...o, children: t })) || void 0;
    } finally {
      H(null), f.destroy.forEach((i) => i());
    }
  }
  if (C.has(n)) return `<${n}${l(o)}>`;
  const s = $(n, "html" in o ? o.html : t) || "";
  return `<${n}${l(o)}>${s}</${n}>`;
}
const a = (r2, { children: s, ...o } = {}, m2) => p ? S(r2, o, s) : oe(r2, o, s);
const isServer = typeof window === "undefined";
const $location = E({
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
const params = E({});
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
    return () => /* @__PURE__ */ a(r, {});
  };
}
const [OutletProvider, outletContext] = L();
function Outlet() {
  const Child = outletContext();
  return () => /* @__PURE__ */ a(Child, {});
}
function buildComponentTree(chain) {
  let Component2 = () => null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const route = chain[i];
    const Comp = route.component;
    const child = Component2;
    Component2 = () => /* @__PURE__ */ a(OutletProvider, {
      value: () => child,
      children: () => /* @__PURE__ */ a(Comp, {})
    });
  }
  return () => /* @__PURE__ */ a(Component2, {});
}
const Template = ({
  title,
  children
}) => {
  return () => /* @__PURE__ */ a("div", {
    class: () => "p-2 w-full",
    children: () => [() => /* @__PURE__ */ a("h1", {
      class: () => "font-bold text-2xl mb-2",
      children: () => title
    }), () => children()]
  });
};
const ButtonPageList = () => {
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Pages",
    children: () => /* @__PURE__ */ a("ul", {
      class: () => "flex flex-col gap-2",
      children: () => [() => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/"),
          disabled: () => isActiveRoute("/"),
          children: () => "All"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/lazy"),
          disabled: () => isActiveRoute("/lazy"),
          children: () => "Lazy"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/forms"),
          disabled: () => isActiveRoute("/forms"),
          children: () => "Forms"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/contexts"),
          disabled: () => isActiveRoute("/contexts"),
          children: () => "Contexts"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/dropdown-list"),
          disabled: () => isActiveRoute("/dropdown-list"),
          children: () => "Dropdown Lists"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/non-async-suspense"),
          disabled: () => isActiveRoute("/non-async-suspense"),
          children: () => "Non Async Suspense"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/stacked-suspense"),
          disabled: () => isActiveRoute("/stacked-suspense"),
          children: () => "Stacked Suspense"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/pokedex-list"),
          disabled: () => isActiveRoute("/pokedex-list"),
          children: () => "PokeDex List"
        })
      }), () => /* @__PURE__ */ a("li", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => navigate("/pokedex-list-suspense"),
          disabled: () => isActiveRoute("/pokedex-list-suspense"),
          children: () => "PokeDex List with Suspense"
        })
      })]
    })
  });
};
function Contexts() {
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Contexts",
    children: () => [() => /* @__PURE__ */ a(Form, {
      children: () => /* @__PURE__ */ a(Input$1, {})
    }), () => /* @__PURE__ */ a(Form, {
      children: () => /* @__PURE__ */ a(Wrapper, {
        children: () => /* @__PURE__ */ a(Input$1, {})
      })
    })]
  });
}
const [FormProvider, formContext] = L();
function Form({
  children
}) {
  const state = E({
    name: "asd"
  });
  return () => /* @__PURE__ */ a(FormProvider, {
    value: () => state,
    children: () => children()
  });
}
function Wrapper({
  children
}) {
  return () => /* @__PURE__ */ a(r, {
    children: () => [() => /* @__PURE__ */ a("div", {
      children: () => "Hi"
    }), () => " ", () => children()]
  });
}
function Input$1() {
  const forms = formContext();
  const i = A(0);
  const cleanup = setInterval(() => {
    i.value++;
  }, 1e3);
  se(() => {
    clearInterval(cleanup);
  });
  const nameEl = () => /* @__PURE__ */ a("div", {
    children: () => [() => "Name: ", () => forms.name, () => " Hi"]
  });
  return () => /* @__PURE__ */ a(r, {
    children: () => [() => /* @__PURE__ */ a("div", {
      children: () => [() => "Name: ", () => forms.name]
    }), () => nameEl, () => /* @__PURE__ */ a("input", {
      type: () => "text",
      name: () => "name",
      onInput: () => (event) => forms.name = event.currentTarget.value,
      placeholder: () => "name",
      autoComplete: () => "off",
      value: () => forms.name
    }), " ", () => i.value]
  });
}
const name = E({
  firstName: "First name",
  lastName: "Last name"
});
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const Dropdowns = () => {
  const dropdownStore = E({
    showDropdown: true,
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
  ce(async () => {
    console.log("Dropdowns onMount");
  });
  se(async () => {
    console.log("Dropdowns onDestroy");
  });
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Dropdown List",
    children: () => /* @__PURE__ */ a("div", {
      class: () => "flex flex-col gap-4",
      children: () => [() => /* @__PURE__ */ a("div", {
        children: () => /* @__PURE__ */ a("div", {
          class: () => "flex gap-2 items-center",
          children: () => [() => /* @__PURE__ */ a("span", {
            children: () => "Add Dropdown"
          }), () => /* @__PURE__ */ a("button", {
            class: () => "btn",
            onClick: () => dropdownStore.addDropdown,
            children: () => "+"
          }), () => /* @__PURE__ */ a("button", {
            class: () => "btn",
            onClick: () => dropdownStore.removeDropdown,
            children: () => "-"
          })]
        })
      }), () => /* @__PURE__ */ a("div", {
        class: () => "flex gap-2 items-center",
        children: () => [() => /* @__PURE__ */ a("span", {
          children: () => "Sort"
        }), () => /* @__PURE__ */ a("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleSort,
          children: () => dropdownStore.sortDirection === "asc" ? "↑" : "↓"
        }), () => /* @__PURE__ */ a("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleRandomize,
          children: () => "Randomize"
        })]
      }), () => /* @__PURE__ */ a("div", {
        children: () => /* @__PURE__ */ a("button", {
          onClick: () => () => dropdownStore.showDropdown = !dropdownStore.showDropdown,
          children: () => "Unmount Dropdown List"
        })
      }), () => dropdownStore.showDropdown && /* @__PURE__ */ a(DropdownList, {
        dropdowns: () => dropdownStore
      }), () => /* @__PURE__ */ a("div", {
        children: () => "Hi"
      })]
    })
  });
};
const DropdownList = ({
  dropdowns
}) => {
  console.log("rerender");
  ce(async () => {
    console.log("DropdownList onMount");
  });
  se(async () => {
    console.log("DropdownList onDestroy");
  });
  return () => /* @__PURE__ */ a("div", {
    class: () => "flex gap-2 flex-col lg:flex-row",
    children: () => Te(() => dropdowns.numbers).each((number) => /* @__PURE__ */ a(Dropdown, {
      number: () => number
    }))
  });
};
const Dropdown = ({
  number
}) => {
  console.log("rerender");
  const isOpen = A(false);
  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };
  return () => /* @__PURE__ */ a(r, {
    children: () => /* @__PURE__ */ a("div", {
      class: () => "relative lg:w-[calc(100%/8)]",
      children: () => [() => /* @__PURE__ */ a("div", {
        children: () => [() => /* @__PURE__ */ a("button", {
          class: () => "btn w-full",
          onClick: () => handleToggle,
          children: () => [() => "Open Dropdown ", () => number]
        }), () => /* @__PURE__ */ a("div", {
          class: () => "break-all",
          children: () => [() => "Hi ", () => name.firstName]
        })]
      }), () => isOpen.value && /* @__PURE__ */ a("div", {
        class: () => "absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10",
        children: () => /* @__PURE__ */ a("ul", {
          children: () => Array.from({
            length: 3
          }).map((_2, i) => i + 1).map((item) => /* @__PURE__ */ a("li", {
            class: () => "cursor-pointer p-2 rounded hover:bg-gray-100",
            children: () => [() => "Dropdown ", () => item]
          }))
        })
      })]
    })
  });
};
const Forms = () => {
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Forms",
    children: () => /* @__PURE__ */ a("div", {
      children: () => [() => /* @__PURE__ */ a("div", {
        children: () => [() => /* @__PURE__ */ a("label", {
          class: () => "break-all",
          for: () => "name-input2",
          children: () => [() => "Hi ", () => name.firstName]
        }), () => /* @__PURE__ */ a("div", {
          children: () => /* @__PURE__ */ a("input", {
            type: () => "text",
            value: () => name.firstName,
            id: () => "name-input2"
          })
        })]
      }), () => /* @__PURE__ */ a("div", {
        children: () => [() => /* @__PURE__ */ a(Counter, {}), () => /* @__PURE__ */ a(Input, {})]
      })]
    })
  });
};
function Counter() {
  const count = A(0);
  const double = F(() => count.value * 2);
  const handleCount = () => {
    count.value++;
  };
  L$1(() => {
  });
  L$1(() => {
  });
  se(() => {
    console.log("bye");
  });
  return () => /* @__PURE__ */ a(r, {
    children: () => [() => count.value, () => /* @__PURE__ */ a("div", {
      children: () => [() => "Count: ", () => count.value]
    }), () => /* @__PURE__ */ a("div", {
      children: () => [() => "Double Count: ", () => double.value]
    }), () => /* @__PURE__ */ a("button", {
      disabled: () => count.value >= 5,
      onClick: () => handleCount,
      children: () => "Add counter"
    }), () => /* @__PURE__ */ a("div", {
      children: () => count.value <= 3 ? /* @__PURE__ */ a("div", {
        children: () => "Hi"
      }) : "string"
    })]
  });
}
function Input() {
  return () => /* @__PURE__ */ a("div", {
    children: () => [() => /* @__PURE__ */ a("label", {
      class: () => "break-all",
      for: () => "name-input",
      children: () => [() => "Name ", () => name.firstName, () => " ", () => /* @__PURE__ */ a("span", {
        children: () => "Hi"
      })]
    }), () => /* @__PURE__ */ a("div", {
      children: () => /* @__PURE__ */ a("input", {
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
const LazyImport = P(() => import("./assets/LazyImport-CC76jfk6.js"), "LazyImport");
const LazyTest = P(() => import("./assets/Test-DUGnjMB5.js"), "Test");
const Lazy = () => {
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Lazy",
    children: () => /* @__PURE__ */ a("div", {
      children: () => [() => /* @__PURE__ */ a(Y, {
        fallback: () => "Tester",
        children: () => /* @__PURE__ */ a(LazyImport, {})
      }), () => /* @__PURE__ */ a(Y, {
        children: () => /* @__PURE__ */ a(LazyTest, {})
      }), () => /* @__PURE__ */ a("h1", {
        children: () => "Test"
      })]
    })
  });
};
function NonAsyncSuspense() {
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Non-Async Suspense",
    children: () => /* @__PURE__ */ a("div", {
      children: () => /* @__PURE__ */ a(Y, {
        fallback: () => /* @__PURE__ */ a("div", {
          children: () => "hi"
        }),
        children: () => /* @__PURE__ */ a("div", {
          children: () => "Children"
        })
      })
    })
  });
}
const PokeDex = () => {
  const pokeDex = E({
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
  ce(async () => {
    const controller = new AbortController();
    await pokeDex.fetchData("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20", controller);
    return () => {
      console.log("Cleaning up PokeDex component");
      controller.abort();
    };
  });
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.handleSort(key);
  return () => /* @__PURE__ */ a(Template, {
    title: () => "PokeDex List",
    children: () => [() => /* @__PURE__ */ a("div", {
      class: () => "break-all",
      children: () => [() => "Hi ", () => name.firstName]
    }), () => /* @__PURE__ */ a("table", {
      class: () => "w-full mx-auto my-2 table-fixed",
      children: () => [() => /* @__PURE__ */ a("thead", {
        children: () => /* @__PURE__ */ a("tr", {
          children: () => [() => /* @__PURE__ */ a("th", {
            class: () => "w-1/3",
            children: () => "ID"
          }), () => /* @__PURE__ */ a("th", {
            onClick: () => sortOnClick("name"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "Name"
          }), () => /* @__PURE__ */ a("th", {
            onClick: () => sortOnClick("url"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "URL"
          })]
        })
      }), () => /* @__PURE__ */ a("tbody", {
        children: () => [() => pokeDex.isLoading && /* @__PURE__ */ a(r, {
          children: () => Te(() => Array.from({
            length: 20
          }).map((_2, i) => i + 1)).each((number) => /* @__PURE__ */ a("tr", {
            children: () => /* @__PURE__ */ a("td", {
              colSpan: () => 3,
              class: () => "h-[24px] text-center",
              children: () => number === 10 && "loading..."
            })
          }))
        }), () => !pokeDex.isLoading && /* @__PURE__ */ a(r, {
          children: () => Te(() => pokeDex.pokeDexList).each(({
            name: name2,
            url
          }, index) => /* @__PURE__ */ a("tr", {
            children: () => [() => /* @__PURE__ */ a("td", {
              class: () => "w-1/3 text-center",
              children: () => index.value + 1
            }), () => /* @__PURE__ */ a("td", {
              class: () => "w-1/3 text-center truncate",
              children: () => name2
            }), () => /* @__PURE__ */ a("td", {
              class: () => "w-1/3 text-center truncate",
              onClick: () => showUrlOnClick(url),
              children: () => url
            })]
          }))
        })]
      })]
    }), () => /* @__PURE__ */ a("div", {
      class: () => "flex gap-4 justify-center",
      children: () => [() => /* @__PURE__ */ a("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.prevLink),
        disabled: () => pokeDex.isLoading || !pokeDex.prevLink,
        children: () => "Previous"
      }), () => /* @__PURE__ */ a("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.nextLink),
        disabled: () => pokeDex.isLoading || !pokeDex.nextLink,
        children: () => "Next"
      })]
    })]
  });
};
const PokeDexSuspense = () => {
  const pokeDex = E({
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
  const pokeDexResource = I(async (url) => {
    const response = await fetch(url);
    const json = await response.json();
    return json;
  }, [() => pokeDex.url]);
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.sort(key);
  return () => /* @__PURE__ */ a(Template, {
    title: () => "PokeDex List (via Suspense)",
    children: () => /* @__PURE__ */ a("div", {
      children: () => [() => /* @__PURE__ */ a("div", {
        class: () => "break-all",
        children: () => [() => "Hi ", () => name.firstName]
      }), () => /* @__PURE__ */ a("table", {
        class: () => "w-full mx-auto my-2 table-fixed",
        children: () => [() => /* @__PURE__ */ a("thead", {
          children: () => /* @__PURE__ */ a("tr", {
            children: () => [() => /* @__PURE__ */ a("th", {
              class: () => "w-1/3",
              children: () => "ID"
            }), () => /* @__PURE__ */ a("th", {
              onClick: () => sortOnClick("name"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "Name"
            }), () => /* @__PURE__ */ a("th", {
              onClick: () => sortOnClick("url"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "URL"
            })]
          })
        }), () => /* @__PURE__ */ a("tbody", {
          children: () => /* @__PURE__ */ a(Y, {
            fallback: () => /* @__PURE__ */ a(r, {
              children: () => Array.from({
                length: 20
              }).map((_2, i) => i + 1).map((number) => /* @__PURE__ */ a("tr", {
                children: () => /* @__PURE__ */ a("td", {
                  colSpan: () => 3,
                  class: () => "h-[24px] text-center",
                  children: () => number === 10 && "loading..."
                })
              }))
            }),
            children: () => /* @__PURE__ */ a(r, {
              children: () => pokeDexResource.data.results.map(({
                name: name2,
                url
              }, index) => /* @__PURE__ */ a("tr", {
                children: () => [() => /* @__PURE__ */ a("td", {
                  class: () => "w-1/3 text-center",
                  children: () => index + 1
                }), () => /* @__PURE__ */ a("td", {
                  class: () => "w-1/3 text-center truncate",
                  children: () => name2
                }), () => /* @__PURE__ */ a("td", {
                  class: () => "w-1/3 text-center truncate",
                  onClick: () => showUrlOnClick(url),
                  children: () => url
                })]
              }))
            })
          })
        })]
      }), () => /* @__PURE__ */ a("div", {
        class: () => "flex gap-4 justify-center",
        children: () => [() => /* @__PURE__ */ a("button", {
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
        }), () => /* @__PURE__ */ a("button", {
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
const StackedSuspense = S$1(() => {
  const msg2 = I(async () => {
    console.log("called");
    await sleep(2e3);
    return "hello world 2";
  }, []);
  return () => /* @__PURE__ */ a(Template, {
    title: () => "Stacked Suspense",
    children: () => /* @__PURE__ */ a("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => /* @__PURE__ */ a(Y, {
        fallback: () => /* @__PURE__ */ a("div", {
          children: () => "loading 1..."
        }),
        children: () => [() => /* @__PURE__ */ a(Component, {}), () => /* @__PURE__ */ a(Y, {
          fallback: () => /* @__PURE__ */ a("div", {
            children: () => "loading 2..."
          }),
          children: () => msg2.data
        })]
      })
    })
  });
});
const Component = S$1(() => {
  const msg = I(async () => {
    await sleep(1e3);
    return `hello world`;
  }, []);
  return () => /* @__PURE__ */ a("div", {
    children: () => msg.data
  });
});
const routes = [{
  path: "/",
  component: () => {
    console.log("layout rerender");
    return () => /* @__PURE__ */ a("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ a(ButtonPageList, {}), () => /* @__PURE__ */ a(Outlet, {})]
    });
  },
  children: [{
    path: "/",
    component: () => /* @__PURE__ */ a(r, {
      children: () => [() => /* @__PURE__ */ a(Lazy, {}), () => /* @__PURE__ */ a(Forms, {}), () => /* @__PURE__ */ a(Contexts, {}), () => /* @__PURE__ */ a(Dropdowns, {}), () => /* @__PURE__ */ a(NonAsyncSuspense, {}), () => /* @__PURE__ */ a(StackedSuspense, {}), () => /* @__PURE__ */ a(PokeDex, {}), () => /* @__PURE__ */ a(PokeDexSuspense, {})]
    })
  }, {
    path: "/lazy",
    component: Lazy
  }, {
    path: "/contexts",
    component: Contexts
  }, {
    path: "/pokedex-list",
    component: PokeDex
  }, {
    path: "/stacked-suspense",
    component: StackedSuspense
  }, {
    path: "/pokedex-list-suspense",
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
  return () => /* @__PURE__ */ a(r, {
    children: () => /* @__PURE__ */ a(Router, {
      url: () => url,
      routes: () => routes
    })
  });
};
function _(a2) {
  return de(true), new ReadableStream({ start(r2) {
    const o = new AsyncLocalStorage(), s = new TextEncoder();
    let n = 0;
    globalThis.__stream_context = { encoder: s, controller: r2, start: () => n++, end: () => n--, tryClose: () => {
      n || r2.close();
    } }, o.run(globalThis.__stream_context, () => {
      const c = o.getStore();
      globalThis.__stream_context = c;
      try {
        const t = S(a2, {});
        r2.enqueue(s.encode(t)), globalThis.__stream_context.tryClose();
      } catch (t) {
        console.error("renderToStream error:", t);
      }
    });
  } });
}
const render = (url) => {
  return _(() => /* @__PURE__ */ a(App, {
    url: () => url
  }));
};
export {
  A,
  L$1 as L,
  P,
  Y,
  a,
  L as b,
  ce as c,
  r,
  render
};
