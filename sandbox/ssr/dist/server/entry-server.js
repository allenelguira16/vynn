const I = /* @__PURE__ */ new Map(), de = (e2) => {
  let n;
  return e2 !== void 0 ? (I.has(e2) || I.set(e2, { states: [] }), n = I.get(e2)) : n = { states: [] }, { ...n, index: 0 };
};
let J = null;
function j$1(e2) {
  J = e2;
}
function b() {
  return J;
}
let S$2 = () => (globalThis.__stream_context ?? (globalThis.__stream_context = {}), globalThis.__stream_context);
(async () => {
  if (typeof window > "u") {
    const e2 = "async_hooks", { AsyncLocalStorage: n } = await import(
      /* @vite-ignore */
      e2
    );
    new n();
    S$2 = () => {
      return globalThis.__stream_context ?? (globalThis.__stream_context = {}), globalThis.__stream_context;
    };
  } else S$2 = () => {
    throw new Error("getCurrentStream() is server-only");
  };
})();
const w = /* @__PURE__ */ new WeakMap(), R$1 = () => {
  let e2;
  if (!g$2) w.has(window) || w.set(window, { suspenseID: 0, resourceID: 0, memo: /* @__PURE__ */ new Map() }), e2 = w.get(window);
  else {
    const n = S$2();
    w.has(n) || w.set(n, { suspenseID: 0, resourceID: 0, memo: /* @__PURE__ */ new Map() }), e2 = w.get(n);
  }
  if (!e2) throw new Error("[vynn]: context does not exists");
  return e2;
};
let m = null;
function K(e2) {
  m = e2;
}
const H = /* @__PURE__ */ new Set();
let O$1 = false;
function he(e2) {
  H.add(e2), O$1 || (O$1 = true, queueMicrotask(() => {
    for (const n of H) n();
    H.clear(), O$1 = false;
  }));
}
function L$2(e2) {
  const n = b(), t = async () => {
    q(t), t.cleanup && (t.cleanup(), t.cleanup = void 0);
    const r2 = m;
    m = t, n && n.effect.push(t);
    try {
      const s = e2();
      if (typeof s == "function") t.cleanup = s;
      else if (s instanceof Promise) {
        const i2 = await s;
        typeof i2 == "function" && (t.cleanup = i2);
      }
    } finally {
      m = r2;
    }
  }, o = () => q(t);
  return t.deps = [], t(), o;
}
function q(e2) {
  if (e2.deps) {
    for (const n of e2.deps) n.delete(e2);
    e2.deps.length = 0;
  }
  e2.cleanup && (e2.cleanup(), e2.cleanup = void 0);
}
const F = /* @__PURE__ */ new WeakMap();
function Q(e2, n) {
  if (!m) return;
  let t = F.get(e2);
  t || (t = /* @__PURE__ */ new Map(), F.set(e2, t));
  let o = t.get(n);
  o || (o = /* @__PURE__ */ new Set(), t.set(n, o)), o.has(m) || (o.add(m), m.deps ? m.deps.push(o) : m.deps = [o]);
}
function X(e2, n) {
  const t = F.get(e2);
  if (!t) return;
  const o = t.get(n);
  if (o) for (const r2 of o) he(r2);
}
function M(e2) {
  const n = b();
  if (n && n.state) {
    const { states: t, index: o } = n.state;
    if (t.length <= o) {
      const r2 = Y(e2);
      t.push(r2);
    }
    return t[n.state.index++];
  }
  return Y(e2);
}
function Y(e2) {
  const n = { value: e2 };
  return new Proxy(n, { get(t, o, r2) {
    return Q(t, o), Reflect.get(t, o, r2);
  }, set(t, o, r2, s) {
    const i2 = t[o], a = Reflect.set(t, o, r2, s);
    return i2 !== r2 && X(t, o), a;
  } });
}
function Z(e2) {
  const n = m;
  K(null);
  try {
    return e2();
  } finally {
    K(n);
  }
}
const N = /* @__PURE__ */ new WeakMap();
function ye(e2, n, t) {
  let o = N.get(e2);
  o || (o = /* @__PURE__ */ new Map(), N.set(e2, o)), o.has(n) && e2.removeEventListener(n, o.get(n)), e2.addEventListener(n, t), o.set(n, t);
}
function we(e2, n) {
  const t = N.get(e2);
  if (!t) return;
  const o = t.get(n);
  o && (e2.removeEventListener(n, o), t.delete(n)), t.size === 0 && N.delete(e2);
}
function ve(e2, n) {
  for (const t in n) L$2(() => {
    const o = n[t], r2 = typeof o == "function" && t !== "ref" ? o() : o;
    if (t.startsWith("on") && e2 instanceof HTMLElement) {
      const i2 = t.slice(2).toLowerCase();
      return ye(e2, i2, r2), () => we(e2, i2);
    }
    const s = e2 instanceof HTMLInputElement || e2 instanceof HTMLTextAreaElement || e2 instanceof HTMLSelectElement;
    if (t === "value" && s && typeof n.onInput != "function" && typeof n.onChange != "function") {
      e2.value = r2;
      const i2 = () => {
        e2.value !== r2 && (e2.value = r2);
      };
      return e2.setAttribute(t, r2), e2.addEventListener("input", i2), () => e2.removeEventListener("input", i2);
    }
    if (t === "ref" && typeof r2 == "function") {
      r2(e2);
      return;
    }
    if (t === "style" && typeof r2 == "object" && e2 instanceof HTMLElement) {
      Ee(e2, r2);
      return;
    }
    if (typeof r2 == "boolean") {
      e2.toggleAttribute(t, r2);
      return;
    }
    if (t === "html" && typeof r2 == "string") {
      e2.innerHTML = r2;
      return;
    }
    e2.setAttribute(t, r2);
  });
}
function Se(e2) {
  return CSS.supports(e2, "0") && !CSS.supports(e2, "0px");
}
function Ee(e2, n) {
  if (e2 instanceof HTMLElement) for (const t in n) {
    if (!Object.hasOwn(n, t)) continue;
    const o = n[t];
    if (o == null || t === "length" || t === "parentRule") continue;
    const r2 = typeof o == "number", s = r2 && !Se(t);
    e2.style[t] = r2 ? s ? `${o}px` : `${o}` : String(o);
  }
}
const W = /* @__PURE__ */ new Map();
function xe(e2, n) {
  W.set(e2, n);
}
function U(e2) {
  const n = W.get(e2);
  if (n) {
    for (const t of n) t();
    W.delete(e2);
  }
  for (const t of e2.childNodes) U(t);
}
function ee(e2) {
  return { id: crypto.randomUUID(), mount: [], state: de(e2), effect: [], destroy: [], suspenseID: 0, resourceID: 0 };
}
function te(e2) {
  const n = b();
  if (!n) throw new Error("onDestroy called outside of component");
  n.destroy.push(e2);
}
function ne(e2) {
  if (g$2) return;
  const n = b();
  if (!n) throw new Error("onMount called outside of component");
  n.mount.push(e2);
}
function be(e2, n) {
  if (!n) return;
  const t = [];
  xe(e2, t);
  const o = async () => {
    for (const r2 of n.mount) {
      const s = await r2();
      s && t.push(s);
    }
    for (const r2 of n.destroy) t.push(r2);
    for (const r2 of n.effect) t.push(() => Promise.resolve(q(r2)));
  };
  queueMicrotask(() => Promise.resolve().then(o));
}
function Ce(e2) {
  if (e2 instanceof Node) return e2;
  if (typeof e2 == "string" || typeof e2 == "number") {
    const { currentNode: n, next: t } = T();
    return n ? (t(), n) : document.createTextNode(String(e2));
  }
  throw new Error(`Unknown value: ${e2}`);
}
function _(e2, n) {
  const t = [];
  function o(s, i2) {
    let a = [], h = [];
    const l2 = () => {
      for (const f of a) U(f), f.parentNode === e2 && e2.removeChild(f);
      for (const f of h) f();
      a = [], h = [];
    }, c = ue(), u = L$2(() => {
      try {
        l2();
        const f = s instanceof Function ? s() : s, p2 = G(f);
        for (const d of p2) if (!A(d)) if (typeof d == "function") {
          const y2 = document.createTextNode("");
          e2.insertBefore(y2, i2);
          const D = o(d, y2);
          h.push(D), a.push(y2);
        } else {
          const y2 = Ce(d);
          e2.insertBefore(y2, i2), a.push(y2);
        }
      } catch (f) {
        if (f instanceof Promise && c) c(f);
        else throw f;
      }
    });
    return () => {
      u(), l2();
    };
  }
  const r2 = o(n, null);
  return t.push(r2), () => {
    for (const s of t) s();
  };
}
const Le = [ae, le, pe];
function oe(e2, n) {
  if (!Le.includes(e2)) for (const t in n) n[t] = n[t] instanceof Function ? n[t]() : n[t];
}
const re = /* @__PURE__ */ new WeakSet();
function se(e2, n = {}, t, o) {
  oe(e2, n);
  const r2 = o ? o().toString() + e2.toString() : void 0, s = ee(r2);
  j$1(s);
  const i2 = _e(e2.name), a = G([i2, Z(() => e2({ ...n, children: t }))]).flat();
  return j$1(null), be(i2, s), a;
}
queueMicrotask(() => {
  g$2 || new MutationObserver((e2) => {
    for (const n of e2) for (const t of n.removedNodes) U(t);
  }).observe(document.body, { childList: true, subtree: true });
});
function ce(e2, n, t, o) {
  var _a;
  if (typeof e2 == "function") return se(e2, n, t, o);
  if (e2 === "html") return t;
  v$1.push(((_a = n.xmlns) == null ? void 0 : _a.call(n)) ?? v$1[v$1.length - 1]);
  const r2 = Me(e2);
  return ve(r2, n), _(r2, t), v$1.pop(), r2;
}
const v$1 = [];
function Me(e2) {
  const { currentNode: n, next: t } = T();
  if (n instanceof Element) {
    if (n.tagName.toLowerCase() !== e2) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
    return t(), n;
  }
  const o = v$1[v$1.length - 1];
  return o ? document.createElementNS(o, e2) : document.createElement(e2);
}
function Ne(e2) {
  return !/<[^>]+>/g.test(e2);
}
function ie(e2, n = false) {
  if (A(e2)) return null;
  if (typeof e2 == "string" || typeof e2 == "number") {
    let t = String(e2);
    return Ne(t) && !n && (t = `<!--!-->${t}<!--/-->`), t;
  }
  throw new Error(`Unknown value: ${e2}`);
}
function E$1(e2) {
  return A(e2) ? null : typeof e2 == "function" ? E$1(e2()) : Array.isArray(e2) ? e2.map(E$1).join("") || null : ie(e2);
}
function _e(e2) {
  let n;
  return process.env.NODE_ENV, n = document.createTextNode(""), re.add(n), n;
}
const A = (e2) => e2 == null || e2 === false;
function z(e2) {
  const n = ((t) => {
    const o = R$1().memo;
    let r2 = o.get(n);
    return r2 || (r2 = { lastProps: void 0, hasLast: false, lastResult: void 0 }, o.set(n, r2)), r2.hasLast && B(r2.lastProps, t) || (r2.lastProps = t, r2.lastResult = e2(t), r2.hasLast = true), r2.lastResult;
  });
  return n;
}
function B(e2, n) {
  if (e2 === n || e2 !== e2 && n !== n) return true;
  if (e2 == null || n == null) return false;
  if (e2 instanceof Date && n instanceof Date) return e2.getTime() === n.getTime();
  if (e2 instanceof RegExp && n instanceof RegExp) return e2.toString() === n.toString();
  if (Array.isArray(e2) && Array.isArray(n)) {
    if (e2.length !== n.length) return false;
    for (let t = 0; t < e2.length; t++) if (!B(e2[t], n[t])) return false;
    return true;
  }
  if (typeof e2 == "object" && typeof n == "object" && e2.constructor === Object && n.constructor === Object) {
    const t = Object.keys(e2), o = Object.keys(n);
    if (t.length !== o.length) return false;
    for (const r2 of t) if (!Object.prototype.hasOwnProperty.call(n, r2) || !B(e2[r2], n[r2])) return false;
    return true;
  }
  return false;
}
const G = (e2) => (Array.isArray(e2) ? e2 : [e2]).flat(1 / 0), g$2 = typeof window > "u";
let $$1 = false;
let x$1 = [], P$1 = 0;
function T() {
  return { renderedNodes: x$1, get currentNode() {
    if (!g$2) return x$1[P$1];
  }, get isHydrating() {
    return !!x$1[P$1];
  }, next: () => {
    P$1 < x$1.length && P$1++;
  } };
}
const k$1 = [];
function ue() {
  return k$1[k$1.length - 1];
}
function ae(e2) {
  const { fallback: n = () => null, children: t } = e2, o = z(() => t()), r2 = z(() => n());
  if (g$2) return r2 == null ? void 0 : r2();
  const s = M(() => r2 == null ? void 0 : r2()), i2 = (l2) => {
    k$1.pop(), queueMicrotask(() => {
      r2 && (s.value = "__fromLazy" in l2 ? () => null : r2);
    }), l2.then(() => {
      a(o);
    });
  }, a = (l2) => {
    k$1.push(i2);
    try {
      s.value = l2;
    } catch (c) {
      if (c instanceof Promise) i2(c);
      else throw c;
    }
  };
  function h(l2) {
    if (!T().isHydrating) {
      l2();
      return;
    }
    requestAnimationFrame(() => h(l2));
  }
  return !g$2 && window.__SSR_STREAMING_APP__ ? a(o) : h(() => {
    a(o);
  }), () => {
    var _a;
    return (_a = s.value) == null ? void 0 : _a.call(s);
  };
}
function Te({ children: e2 }) {
  return e2;
}
const fe = (e2, { children: n, ...t } = {}, o) => ce(e2, t, n, o);
function ke(e2) {
  return { each(n) {
    const t = e2;
    return n = n, g$2 ? t().map((o, r2) => n(o, { value: r2 })) : fe(le, { each: t, children: n });
  } };
}
function le({ each: e2, children: n }) {
  const t = ue(), o = M([]), r2 = De(e2, n);
  return L$2(() => {
    try {
      o.value = r2();
    } catch (s) {
      if (s instanceof Promise && t) t(s);
      else throw s;
    }
  }), () => o.value;
}
function De(e2, n) {
  let t = [];
  return () => {
    var _a, _b;
    const o = e2() || [], r2 = o.length, s = new Array(r2), i2 = /* @__PURE__ */ new Map();
    for (let c = 0; c < t.length; c++) {
      const u = t[c].value;
      i2.has(u) || i2.set(u, []), i2.get(u).push(c);
    }
    const a = new Array(r2).fill(-1);
    for (let c = 0; c < r2; c++) {
      const u = o[c], f = i2.get(u);
      if (f && f.length) {
        const p2 = f.shift();
        a[c] = p2, s[c] = t[p2];
      } else {
        const p2 = M(c), d = n(u, p2);
        s[c] = { value: u, index: p2, element: d };
      }
    }
    for (let c = 0; c < t.length; c++) if (!a.includes(c)) {
      const u = t[c].element;
      (_a = u.parentNode) == null ? void 0 : _a.removeChild(u);
    }
    const h = Ie(a);
    let l2 = h.length - 1;
    for (let c = r2 - 1; c >= 0; c--) {
      const u = s[c];
      if (a[c] === -1 || c !== h[l2]) {
        const f = c + 1 < r2 ? s[c + 1].element : null;
        (_b = u.element.parentNode) == null ? void 0 : _b.insertBefore(u.element, f);
      } else l2--;
      u.index.value = c;
    }
    return t = s, t.map((c) => c.element);
  };
}
function Ie(e2) {
  const n = e2.slice(), t = [];
  let o, r2;
  for (let s = 0; s < e2.length; s++) {
    const i2 = e2[s];
    if (!(i2 < 0)) {
      if (t.length === 0 || e2[t[t.length - 1]] < i2) {
        n[s] = t.length > 0 ? t[t.length - 1] : -1, t.push(s);
        continue;
      }
      for (o = 0, r2 = t.length - 1; o < r2; ) {
        const a = (o + r2) / 2 | 0;
        e2[t[a]] < i2 ? o = a + 1 : r2 = a;
      }
      i2 < e2[t[o]] && (o > 0 && (n[s] = t[o - 1]), t[o] = s);
    }
  }
  for (o = t.length, r2 = t[o - 1]; o-- > 0; ) t[o] = r2, r2 = n[r2];
  return t;
}
function pe({ children: e2, target: n }) {
  let t;
  return ne(() => {
    const o = (n instanceof Function ? n() : n) ?? document.body;
    t = _(o, e2);
  }), te(() => {
    t();
  }), null;
}
function l$1(n) {
  const o = [];
  for (const t in n) {
    if (t.startsWith("on") && typeof n[t] == "function") continue;
    const e2 = typeof n[t] == "function" ? n[t]() : n[t];
    if (t !== "ref" && t !== "style" && t !== "html") {
      if (typeof e2 == "boolean") {
        e2 && o.push(t);
        continue;
      }
      o.push(`${t}="${e2}"`);
    }
  }
  return o.length > 0 && o.unshift(""), o.join(" ");
}
const g$1 = /* @__PURE__ */ new Set(["title", "meta", "script", "style"]);
function $(n, o) {
  function t(e2) {
    const s = [], f = e2 instanceof Function ? e2() : e2, c = G(f);
    for (const i2 of c) if (!A(i2)) if (typeof i2 == "function") {
      const r2 = t(i2);
      A(r2) || s.push(r2);
    } else {
      const r2 = ie(i2, g$1.has(n));
      A(r2) || s.push(r2);
    }
    return s.join("") || null;
  }
  return t(o);
}
const C$2 = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
function S$1(n, o, t, e2) {
  if (typeof n == "function") {
    oe(n, o);
    const f = e2 ? e2().toString() + n.toString() : void 0, c = ee(f);
    j$1(c);
    try {
      return E$1(n({ ...o, children: t })) || void 0;
    } finally {
      j$1(null), c.destroy.forEach((i2) => i2());
    }
  }
  if (C$2.has(n)) return `<${n}${l$1(o)}>`;
  const s = $(n, "html" in o ? o.html : t) || "";
  return `<${n}${l$1(o)}>${s}</${n}>`;
}
function S(e2) {
  return e2();
}
const E = /* @__PURE__ */ new WeakMap();
function C$1() {
  const o = Symbol("context");
  function e2(t) {
    return E.set(o, t.value), t.children();
  }
  function n() {
    const t = E.get(o);
    if (!t) throw new Error("No provider found for context.");
    return t;
  }
  return [e2, n];
}
function j(o) {
  const e2 = M();
  return L$2(() => {
    e2.value = o();
  }), { get value() {
    return e2.value;
  } };
}
const g = /* @__PURE__ */ new WeakMap();
function P(o) {
  function e2(n) {
    if (g.has(n)) return g.get(n);
    const t = new Proxy(n, { get(r2, u, c) {
      Q(r2, u);
      const i2 = Reflect.get(r2, u, c);
      if (typeof i2 == "function") return i2.bind(c);
      const s = Reflect.getOwnPropertyDescriptor(r2, u);
      return (s == null ? void 0 : s.get) ? s.get.call(c) : typeof i2 == "object" && i2 !== null ? e2(i2) : i2;
    }, set(r2, u, c, i2) {
      const s = r2[u], l2 = Reflect.set(r2, u, c, i2);
      return s !== c && X(r2, u), l2;
    } });
    return g.set(n, t), t;
  }
  return e2(o);
}
function L$1(o, e2) {
  const n = R$1(), t = n.resourceID++;
  let r2 = true, u = null, c, i2 = null, s = "pending";
  const l2 = M(0), _2 = () => {
    r2 = true, u = null, c = void 0, s = "pending";
    const d = e2.map((f) => f());
    !g$2 && window.__resource && window.__resource[t] ? (c = window.__resource[t], u = null, s = "fulfilled", r2 = false, Z(() => l2.value++), delete window.__resource[t], window.__resource.length || delete window.__resource) : (i2 = Z(() => o(...d)), i2.then((f) => {
      if (c = f, u = null, s = "fulfilled", r2 = false, $$1) ;
      Z(() => l2.value++);
    }).catch((f) => {
      c = void 0, u = f, s = "rejected", r2 = false, Z(() => l2.value++);
    })), Z(() => l2.value++);
  };
  return L$2(() => {
    _2();
  }), { get loading() {
    return l2.value, r2;
  }, get error() {
    return u;
  }, get data() {
    if (l2.value, s === "pending") throw i2;
    if (s === "rejected") throw u;
    return c;
  }, refetch: _2, mutate(d) {
    c = d, l2.value++;
  } };
}
const e = (s, { children: r2, ...o }, a) => g$2 ? S$1(s, o, r2, a) : ce(s, o, r2, a);
const p = typeof window > "u", r = P({ pathname: p ? "/" : window.location.pathname, search: p ? "" : window.location.search });
p || window.addEventListener("popstate", () => {
  r.pathname = window.location.pathname, r.search = window.location.search;
});
function y(t) {
  t !== r.pathname && (p ? r.pathname = t : (history.pushState(null, "", t), r.pathname = t, r.search = window.location.search));
}
function v(t, n = true) {
  const a = r.pathname.split("/").filter(Boolean), e2 = t.split("/").filter(Boolean);
  return n && a.length !== e2.length || !n && a.length < e2.length ? false : e2.every((o, c) => o.startsWith(":") || o === a[c]);
}
function k(t, n, a = "") {
  const e2 = (i2, u) => (i2 + "/" + u).replace(/\/+/g, "/"), o = t.split("/").filter(Boolean);
  for (const i2 of n) {
    const u = e2(a, i2.path), d = u.split("/").filter(Boolean), h = {};
    let w2 = true;
    for (let s = 0; s < d.length; s++) {
      const f = d[s], g2 = o[s];
      if (f == null ? void 0 : f.startsWith("*")) {
        const B2 = f.slice(1) || "wildcard";
        return h[B2] = o.slice(s).join("/"), { chain: [i2], params: h };
      }
      if (f == null ? void 0 : f.startsWith(":")) {
        if (!g2) {
          w2 = false;
          break;
        }
        h[f.slice(1)] = g2;
      } else if (f !== g2) {
        w2 = false;
        break;
      }
    }
    if (w2) {
      if (i2.children) {
        const s = k(t, i2.children, u);
        if (s) return { chain: [i2, ...s.chain], params: { ...h, ...s.params } };
      }
      if (d.length === o.length) return { chain: [i2], params: h };
    }
  }
  const c = n.find((i2) => i2.path.startsWith("*"));
  if (c) {
    const i2 = c.path.slice(1) || "wildcard";
    return { chain: [c], params: { [i2]: o.join("/") } };
  }
}
const l = P({});
function x({ url: t, routes: n }) {
  return t && (r.pathname = t), () => {
    console.log("changed");
    const a = k(r.pathname, n);
    if (a) {
      const { chain: e2, params: o } = a;
      for (const c in l) delete l[c];
      return Object.assign(l, o), O(e2);
    }
    for (const e2 in l) delete l[e2];
    return () => e(Te, {});
  };
}
const [C, R] = C$1();
function L() {
  return R()();
}
function O(t) {
  let n = () => null;
  for (let a = t.length - 1; a >= 0; a--) {
    const e$1 = t[a];
    if (!e$1.component) continue;
    const o = e$1.component, c = n;
    n = () => e(C, { value: () => c, children: () => e(o, {}) });
  }
  return n();
}
const Template = ({
  title,
  children
}) => {
  return () => /* @__PURE__ */ e("div", {
    class: () => "p-2 w-full",
    children: () => [() => /* @__PURE__ */ e("h1", {
      class: () => "font-bold text-2xl mb-2",
      children: () => title
    }), () => children()]
  });
};
const ButtonPageList = () => {
  return () => /* @__PURE__ */ e(Template, {
    title: () => "Pages",
    children: () => /* @__PURE__ */ e("ul", {
      class: () => "flex flex-col gap-2",
      children: () => [() => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/"),
          disabled: () => v("/"),
          children: () => "All"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/forms"),
          disabled: () => v("/forms"),
          children: () => "Forms"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/contexts"),
          disabled: () => v("/contexts"),
          children: () => "Contexts"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/dropdown-list"),
          disabled: () => v("/dropdown-list"),
          children: () => "Dropdown Lists"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/non-async-suspense"),
          disabled: () => v("/non-async-suspense"),
          children: () => "Non Async Suspense"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/stacked-suspense"),
          disabled: () => v("/stacked-suspense"),
          children: () => "Stacked Suspense"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/pokedex-list"),
          disabled: () => v("/pokedex-list"),
          children: () => "PokeDex List"
        })
      }), () => /* @__PURE__ */ e("li", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => y("/pokedex-list-suspense"),
          disabled: () => v("/pokedex-list-suspense"),
          children: () => "PokeDex List with Suspense"
        })
      })]
    })
  });
};
function Contexts() {
  return () => /* @__PURE__ */ e(Template, {
    title: () => "Contexts",
    children: () => [() => /* @__PURE__ */ e(Form, {
      children: () => /* @__PURE__ */ e(Input$1, {})
    }), () => /* @__PURE__ */ e(Form, {
      children: () => /* @__PURE__ */ e(Wrapper, {
        children: () => /* @__PURE__ */ e(Input$1, {})
      })
    })]
  });
}
const [FormProvider, formContext] = C$1();
function Form({
  children
}) {
  const state2 = P({
    name: "asd"
  });
  return () => /* @__PURE__ */ e(FormProvider, {
    value: () => state2,
    children: () => children()
  });
}
function Wrapper({
  children
}) {
  return () => /* @__PURE__ */ e(Te, {
    children: () => [() => /* @__PURE__ */ e("div", {
      children: () => "Hi"
    }), () => " ", () => children()]
  });
}
const i = M(0);
setInterval(() => {
  i.value++;
}, 1e3);
function Input$1() {
  const forms = formContext();
  const nameEl = () => /* @__PURE__ */ e("div", {
    children: () => [() => "Name: ", () => forms.name, () => " Hi"]
  });
  return () => /* @__PURE__ */ e(Te, {
    children: () => [() => /* @__PURE__ */ e("div", {
      children: () => [() => "Name: ", () => forms.name]
    }), () => nameEl, () => /* @__PURE__ */ e("input", {
      type: () => "text",
      name: () => "name",
      onInput: () => (event) => forms.name = event.currentTarget.value,
      placeholder: () => "name",
      autoComplete: () => "off",
      value: () => forms.name
    }), " ", () => i.value]
  });
}
const name = P({
  firstName: "First name",
  lastName: "Last name"
});
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const Dropdowns = () => {
  const dropdownStore = P({
    showDropdown: true,
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
      for (let i2 = result.length - 1; i2 > 0; i2--) {
        const j2 = Math.floor(Math.random() * (i2 + 1));
        [result[i2], result[j2]] = [result[j2], result[i2]];
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
  ne(async () => {
    console.log("Dropdowns onMount");
  });
  te(async () => {
    console.log("Dropdowns onDestroy");
  });
  return () => /* @__PURE__ */ e(Template, {
    title: () => "Dropdown List",
    children: () => /* @__PURE__ */ e("div", {
      class: () => "flex flex-col gap-4",
      children: () => [() => /* @__PURE__ */ e("div", {
        children: () => /* @__PURE__ */ e("div", {
          class: () => "flex gap-2 items-center",
          children: () => [() => /* @__PURE__ */ e("span", {
            children: () => "Add Dropdown"
          }), () => /* @__PURE__ */ e("button", {
            class: () => "btn",
            onClick: () => dropdownStore.addDropdown,
            children: () => "+"
          }), () => /* @__PURE__ */ e("button", {
            class: () => "btn",
            onClick: () => dropdownStore.removeDropdown,
            children: () => "-"
          })]
        })
      }), () => /* @__PURE__ */ e("div", {
        class: () => "flex gap-2 items-center",
        children: () => [() => /* @__PURE__ */ e("span", {
          children: () => "Sort"
        }), () => /* @__PURE__ */ e("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleSort,
          children: () => dropdownStore.sortDirection === "asc" ? "↑" : "↓"
        }), () => /* @__PURE__ */ e("button", {
          class: () => "btn",
          onClick: () => dropdownStore.handleRandomize,
          children: () => "Randomize"
        })]
      }), () => /* @__PURE__ */ e("div", {
        children: () => /* @__PURE__ */ e("button", {
          onClick: () => () => dropdownStore.showDropdown = !dropdownStore.showDropdown,
          children: () => "Unmount Dropdown List"
        })
      }), () => dropdownStore.showDropdown && /* @__PURE__ */ e(DropdownList, {
        dropdowns: () => dropdownStore
      }), () => /* @__PURE__ */ e("div", {
        children: () => "Hi"
      })]
    })
  });
};
const DropdownList = ({
  dropdowns
}) => {
  console.log("rerender");
  ne(async () => {
    console.log("DropdownList onMount");
  });
  te(async () => {
    console.log("DropdownList onDestroy");
  });
  return () => /* @__PURE__ */ e("div", {
    class: () => "flex gap-2 flex-col lg:flex-row",
    children: () => dropdowns.numbers.map((number) => /* @__PURE__ */ e(Dropdown, {
      number: () => number
    }, () => number))
  });
};
const Dropdown = ({
  number
}) => {
  const isOpen = M(false);
  const handleToggle = () => {
    isOpen.value = !isOpen.value;
  };
  return () => /* @__PURE__ */ e(Te, {
    children: () => /* @__PURE__ */ e("div", {
      class: () => "relative lg:w-[calc(100%/8)]",
      children: () => [() => /* @__PURE__ */ e("div", {
        children: () => [() => /* @__PURE__ */ e("button", {
          class: () => "btn w-full",
          onClick: () => handleToggle,
          children: () => [() => "Open Dropdown ", () => number]
        }), () => /* @__PURE__ */ e("div", {
          class: () => "break-all",
          children: () => [() => "Hi ", () => name.firstName]
        })]
      }), () => isOpen.value && /* @__PURE__ */ e("div", {
        class: () => "absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10",
        children: () => /* @__PURE__ */ e("ul", {
          children: () => Array.from({
            length: 3
          }).map((_2, i2) => i2 + 1).map((item) => /* @__PURE__ */ e("li", {
            class: () => "cursor-pointer p-2 rounded hover:bg-gray-100",
            children: () => [() => "Dropdown ", () => item]
          }))
        })
      })]
    })
  });
};
const Forms = () => {
  return () => /* @__PURE__ */ e(Template, {
    title: () => "Forms",
    children: () => /* @__PURE__ */ e("div", {
      children: () => [() => /* @__PURE__ */ e("div", {
        children: () => [() => /* @__PURE__ */ e("label", {
          class: () => "break-all",
          for: () => "name-input2",
          children: () => [() => "Hi ", () => name.firstName]
        }), () => /* @__PURE__ */ e("div", {
          children: () => /* @__PURE__ */ e("input", {
            type: () => "text",
            value: () => name.firstName,
            id: () => "name-input2"
          })
        })]
      }), () => /* @__PURE__ */ e("div", {
        children: () => [() => /* @__PURE__ */ e(Counter, {}), () => /* @__PURE__ */ e(Input, {})]
      })]
    })
  });
};
function Counter() {
  const count = M(0);
  const double = j(() => count.value);
  const handleCount = () => {
    count.value++;
  };
  L$2(() => {
  });
  L$2(() => {
  });
  te(() => {
    console.log("bye");
  });
  return () => /* @__PURE__ */ e(Te, {
    children: () => [() => count.value, () => /* @__PURE__ */ e("div", {
      children: () => [() => "Count: ", () => count.value]
    }), () => /* @__PURE__ */ e("div", {
      children: () => [() => "Double Count: ", () => double.value]
    }), () => /* @__PURE__ */ e("button", {
      disabled: () => count.value >= 5,
      onClick: () => handleCount,
      children: () => "Add counter"
    }), () => /* @__PURE__ */ e("div", {
      children: () => count.value <= 3 ? /* @__PURE__ */ e("div", {
        children: () => "Hi"
      }) : "string"
    })]
  });
}
function Input() {
  return () => /* @__PURE__ */ e("div", {
    children: () => [() => /* @__PURE__ */ e("label", {
      class: () => "break-all",
      for: () => "name-input",
      children: () => [() => "Name ", () => name.firstName, () => " ", () => /* @__PURE__ */ e("span", {
        children: () => "Hi"
      })]
    }), () => /* @__PURE__ */ e("div", {
      children: () => /* @__PURE__ */ e("input", {
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
function NonAsyncSuspense() {
  return () => /* @__PURE__ */ e(Template, {
    title: () => "Non-Async Suspense",
    children: () => /* @__PURE__ */ e("div", {
      children: () => /* @__PURE__ */ e(ae, {
        fallback: () => /* @__PURE__ */ e("div", {
          children: () => "hi"
        }),
        children: () => /* @__PURE__ */ e("div", {
          children: () => "Children"
        })
      })
    })
  });
}
const PokeDex = () => {
  const pokeDex = P({
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
      await sleep(1e3);
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
  ne(async () => {
    const controller = new AbortController();
    await pokeDex.fetchData("https://pokeapi.co/api/v2/pokemon/?offset=1100&limit=20", controller);
    return () => {
      console.log("Cleaning up PokeDex component");
      controller.abort();
    };
  });
  return () => /* @__PURE__ */ e(Template, {
    title: () => "PokeDex List",
    children: () => [() => /* @__PURE__ */ e("div", {
      class: () => "break-all",
      children: () => [() => "Hi ", () => name.firstName]
    }), () => /* @__PURE__ */ e("table", {
      class: () => "w-full mx-auto my-2 table-fixed",
      children: () => [() => /* @__PURE__ */ e("thead", {
        children: () => /* @__PURE__ */ e("tr", {
          children: () => [() => /* @__PURE__ */ e("th", {
            class: () => "w-1/3",
            children: () => "ID"
          }), () => /* @__PURE__ */ e("th", {
            onClick: () => () => pokeDex.handleSort("name"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "Name"
          }), () => /* @__PURE__ */ e("th", {
            onClick: () => () => pokeDex.handleSort("url"),
            class: () => "select-none cursor-pointer w-1/3",
            children: () => "URL"
          })]
        })
      }), () => /* @__PURE__ */ e("tbody", {
        children: () => [() => pokeDex.isLoading && /* @__PURE__ */ e(Te, {
          children: () => ke(() => Array.from({
            length: 20
          }).map((_2, i2) => i2 + 1)).each((number) => /* @__PURE__ */ e("tr", {
            children: () => /* @__PURE__ */ e("td", {
              colSpan: () => 3,
              class: () => "h-[24px] text-center",
              children: () => number === 10 && "loading..."
            })
          }))
        }), () => !pokeDex.isLoading && /* @__PURE__ */ e(Te, {
          children: () => ke(() => pokeDex.pokeDexList).each(({
            name: name2,
            url
          }, index) => /* @__PURE__ */ e("tr", {
            children: () => [() => /* @__PURE__ */ e("td", {
              class: () => "w-1/3 text-center",
              children: () => index.value + 1
            }), () => /* @__PURE__ */ e("td", {
              class: () => "w-1/3 text-center truncate",
              children: () => name2
            }), () => /* @__PURE__ */ e("td", {
              class: () => "w-1/3 text-center truncate",
              onClick: () => () => alert(url),
              children: () => url
            })]
          }))
        })]
      })]
    }), () => /* @__PURE__ */ e("div", {
      class: () => "flex gap-4 justify-center",
      children: () => [() => /* @__PURE__ */ e("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.prevLink),
        disabled: () => pokeDex.isLoading || !pokeDex.prevLink,
        children: () => "Previous"
      }), () => /* @__PURE__ */ e("button", {
        class: () => "btn",
        onClick: () => () => pokeDex.fetchData(pokeDex.nextLink),
        disabled: () => pokeDex.isLoading || !pokeDex.nextLink,
        children: () => "Next"
      })]
    })]
  });
};
const PokeDexSuspense = () => {
  const pokeDex = P({
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
  const pokeDexResource = L$1(async (url) => {
    const response = await fetch(url);
    const json = await response.json();
    await sleep(1e3);
    return json;
  }, [() => pokeDex.url]);
  const showUrlOnClick = (url) => () => alert(url);
  const sortOnClick = (key) => () => pokeDex.sort(key);
  return () => /* @__PURE__ */ e(Template, {
    title: () => "PokeDex List (via Suspense)",
    children: () => /* @__PURE__ */ e("div", {
      children: () => [() => /* @__PURE__ */ e("div", {
        class: () => "break-all",
        children: () => [() => "Hi ", () => name.firstName]
      }), () => /* @__PURE__ */ e("table", {
        class: () => "w-full mx-auto my-2 table-fixed",
        children: () => [() => /* @__PURE__ */ e("thead", {
          children: () => /* @__PURE__ */ e("tr", {
            children: () => [() => /* @__PURE__ */ e("th", {
              class: () => "w-1/3",
              children: () => "ID"
            }), () => /* @__PURE__ */ e("th", {
              onClick: () => sortOnClick("name"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "Name"
            }), () => /* @__PURE__ */ e("th", {
              onClick: () => sortOnClick("url"),
              class: () => "select-none cursor-pointer w-1/3",
              children: () => "URL"
            })]
          })
        }), () => /* @__PURE__ */ e("tbody", {
          children: () => /* @__PURE__ */ e(ae, {
            fallback: () => /* @__PURE__ */ e(Te, {
              children: () => ke(() => Array.from({
                length: 20
              }).map((_2, i2) => i2 + 1)).each((number) => /* @__PURE__ */ e("tr", {
                children: () => /* @__PURE__ */ e("td", {
                  colSpan: () => 3,
                  class: () => "h-[24px] text-center",
                  children: () => number === 10 && "loading..."
                })
              }))
            }),
            children: () => /* @__PURE__ */ e(Te, {
              children: () => ke(() => {
                var _a;
                return (_a = pokeDexResource.data) == null ? void 0 : _a.results;
              }).each(({
                name: name2,
                url
              }, index) => /* @__PURE__ */ e("tr", {
                children: () => [() => /* @__PURE__ */ e("td", {
                  class: () => "w-1/3 text-center",
                  children: () => index.value + 1
                }), () => /* @__PURE__ */ e("td", {
                  class: () => "w-1/3 text-center truncate",
                  children: () => name2
                }), () => /* @__PURE__ */ e("td", {
                  class: () => "w-1/3 text-center truncate",
                  onClick: () => showUrlOnClick(url),
                  children: () => url
                })]
              }))
            })
          })
        })]
      }), () => /* @__PURE__ */ e("div", {
        class: () => "flex gap-4 justify-center",
        children: () => [() => /* @__PURE__ */ e("button", {
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
        }), () => /* @__PURE__ */ e("button", {
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
const StackedSuspense = z(() => {
  const msg2 = L$1(async () => {
    await sleep(2e3);
    return "hello world 2";
  }, []);
  return () => /* @__PURE__ */ e(Template, {
    title: () => "Stacked Suspense",
    children: () => /* @__PURE__ */ e("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => /* @__PURE__ */ e(ae, {
        fallback: () => /* @__PURE__ */ e("div", {
          children: () => "loading 1..."
        }),
        children: () => [() => /* @__PURE__ */ e(ae, {
          fallback: () => /* @__PURE__ */ e("div", {
            children: () => "loading 2..."
          }),
          children: () => msg2.data
        }), () => /* @__PURE__ */ e(Component, {})]
      })
    })
  });
});
const Component = z(() => {
  const msg = L$1(async () => {
    await sleep(1e3);
    return "hello world";
  }, []);
  console.log("rerun");
  return () => /* @__PURE__ */ e("div", {
    children: () => msg.data
  });
});
const routes = [{
  path: "/",
  component: () => {
    console.log("layout rerender");
    return () => /* @__PURE__ */ e("div", {
      class: () => "p-2 flex flex-col container m-auto",
      children: () => [() => /* @__PURE__ */ e(ButtonPageList, {}), () => /* @__PURE__ */ e(L, {})]
    });
  },
  children: [{
    path: "/",
    component: () => /* @__PURE__ */ e(Te, {
      children: () => [() => /* @__PURE__ */ e(Forms, {}), () => /* @__PURE__ */ e(Contexts, {}), () => /* @__PURE__ */ e(Dropdowns, {}), () => /* @__PURE__ */ e(NonAsyncSuspense, {}), () => /* @__PURE__ */ e(StackedSuspense, {}), () => /* @__PURE__ */ e(PokeDex, {}), () => /* @__PURE__ */ e(PokeDexSuspense, {})]
    })
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
  return () => /* @__PURE__ */ e(x, {
    url: () => url,
    routes: () => routes
  });
};
const render = (url) => {
  return S(() => /* @__PURE__ */ e(App, {
    url: () => url
  }));
};
export {
  render
};
