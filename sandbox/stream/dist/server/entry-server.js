import { AsyncLocalStorage } from "async_hooks";
//#region ../../packages/vynn/dist/esm/chunks/z2cHyrOy.js
function r({ children: n }) {
	return n;
}
//#endregion
//#region ../../packages/vynn/dist/esm/chunks/CNy5fEqt.js
var k$1 = () => globalThis.__stream_context, I = /* @__PURE__ */ new Map(), de = {
	suspenseID: 0,
	resourceID: 0,
	lazyID: 0,
	stateID: 0,
	memo: /* @__PURE__ */ new Map()
}, _ = () => {
	const e = k$1();
	I.has(e) || I.set(e, de);
	const t = I.get(e);
	if (!t) throw new Error("[vynn]: GlobalContext does not exists");
	return t;
}, me = () => {
	const e = _();
	e.memo.clear(), e.lazyID = 0, e.resourceID = 0, e.stateID = 0, e.suspenseID = 0;
}, h$1 = typeof window > "u";
globalThis.isServerStreaming = !1;
var R = () => globalThis.isServerStreaming, he = (e) => globalThis.isServerStreaming = e;
var w$2 = [], g$1 = 0;
function A$1() {
	return {
		renderedNodes: w$2,
		get currentNode() {
			if (!h$1) return w$2[g$1];
		},
		get isHydrating() {
			return !!w$2[g$1];
		},
		next: () => {
			w$2[g$1] && (w$2[g$1] = void 0, g$1++);
		},
		prev: () => {
			g$1 > 0 && w$2[g$1 - 1] && g$1--;
		}
	};
}
function ge(e, t) {
	w$2 = e;
}
var W = [];
var F$1 = /* @__PURE__ */ new Map();
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
var v = null;
function x$1() {
	return v;
}
function G(e) {
	return {
		parent: e,
		context: /* @__PURE__ */ new Map(),
		cleanups: []
	};
}
function ve() {
	let e = v;
	const t = [];
	for (; e && e.parent;) t.push(...e.cleanups), e = e.parent;
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
	for (; t;) {
		if (t.context.has(e)) return t.context.get(e);
		t = t.parent;
	}
}
var m$1 = null;
function J(e) {
	m$1 = e;
}
var P$1 = /* @__PURE__ */ new Set();
var q$1 = !1;
function Se(e) {
	P$1.add(e), q$1 || (q$1 = !0, queueMicrotask(() => {
		for (const t of P$1) t();
		P$1.clear(), q$1 = !1;
	}));
}
function b$2(e) {
	const t = () => {
		V(t), t.cleanup && (t.cleanup(), t.cleanup = void 0);
		const o = m$1;
		m$1 = t;
		try {
			const r = e();
			typeof r == "function" && (t.cleanup = r);
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
var U = (e) => (Array.isArray(e) ? e : [e]).flat(Infinity), Q = (e) => e.flat(Infinity);
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
var B = /* @__PURE__ */ new WeakMap();
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
	if (o) for (const r of o) Se(r);
}
function C$1(e) {
	let t = H$1("state");
	if (t || (t = {
		states: [],
		index: 0
	}, N("state", t)), t) {
		const { states: n, index: o } = t;
		if (n.length <= o) {
			const r = te(e);
			n.push(r);
		}
		return n[t.index++];
	}
	return te(e);
}
function te(e) {
	return new Proxy({ value: e }, {
		get(n, o, r) {
			return ee(n, o), Reflect.get(n, o, r);
		},
		set(n, o, r, s) {
			const i = n[o], c = Reflect.set(n, o, r, s);
			return i !== r && ne(n, o), c;
		}
	});
}
var L$1 = (e) => e == null || e === !1;
function oe(e) {
	return !/<[^>]+>/g.test(e);
}
function re(e, t = !1) {
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
		if (o instanceof Promise) return [
			y(t),
			`<script>window.__SUSPENSE_DEFAULT_FALLBACK__ ??= [];window.__SUSPENSE_DEFAULT_FALLBACK__[${n}]=true;document.currentScript.remove();<\/script>`,
			"<!--split-->"
		];
		throw o;
	}
}
function _e({ children: e, fallback: t = () => null }) {
	const n = _().suspenseID++, o = k$1(), r = (s) => {
		o.promises.push(s), s.then(() => {
			const c = `<template async-id="${n}">${y(e)}</template>`, a = `<script>__hydrateAsync("${n}");document.currentScript.remove();<\/script>`;
			o.controller.enqueue(o.encoder.encode(c)), o.controller.enqueue(o.encoder.encode(a));
		}).catch((i) => {
			if (i instanceof Promise) r(i);
			else throw i;
		});
	};
	try {
		return y(e);
	} catch (s) {
		return s instanceof Promise && r(s), [
			`<!--~$:${n}-->`,
			y(t),
			`<!--/$:${n}-->`
		];
	}
}
var M$1 = [];
function Ae() {
	return M$1[M$1.length - 1];
}
function se(e) {
	const { fallback: t = () => null, children: n } = e;
	if (R()) return _e({
		fallback: t,
		children: n
	});
	if (h$1) return Ee({
		fallback: t,
		children: n
	});
	window.__SUSPENSE_DEFAULT_FALLBACK__ ??= [];
	const o = _().suspenseID++, s = C$1(!!window.__SUSPENSE_DEFAULT_FALLBACK__[o] ? t : n);
	function i(c) {
		M$1.pop(), queueMicrotask(() => {
			s.value = "__fromLazy" in c ? () => null : t;
		}), c.then(() => {
			N("is-suspending", !1), s.value = n;
		});
	}
	return !h$1 && window.__SSR_STREAMING_APP__ ? s.value = n : ce(() => {
		s.value = n;
	}), N("is-suspending", !0), () => (M$1.push(i), s.value);
}
function ce(e) {
	if (!A$1().isHydrating) {
		e();
		return;
	}
	requestAnimationFrame(() => ce(e));
}
var D = !1;
function xe(e) {
	if (e instanceof Node) return e;
	if (typeof e == "string" || typeof e == "number") {
		const { currentNode: t, next: n } = A$1();
		if (t instanceof Text && !D) {
			if (t.textContent !== String(e)) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
			return n(), t;
		}
		return document.createTextNode(String(e));
	}
	throw new Error(`Unknown value: ${e}`);
}
function S(e, t, n = null) {
	if (!L$1(n) && !n?.parentNode) return () => {};
	let o = [];
	for (const r of Q(U(t))) {
		let s = [], i = [];
		const c = z(`anchor-${r}`, !0);
		e.insertBefore(c, n);
		let a = null;
		const p = Ae(), u = b$2(() => {
			try {
				i.map((f) => f()), i = [];
				const l = typeof r == "function" ? r() : r;
				if (L$1(l)) a && (e.removeChild(a), a = null);
				else if (typeof l == "function") {
					const f = S(e, l, c);
					i.push(f);
				} else if (Array.isArray(l)) {
					const f = S(e, l, c);
					i.push(f);
				} else {
					const f = xe(l);
					a ? e.replaceChild(f, a) : f.isConnected ? (n && e.insertBefore(n, f.nextSibling), e.insertBefore(c, f.nextSibling)) : e.insertBefore(f, c), a = f;
				}
				o.push(() => {
					if (a) {
						if (H$1("is-suspending") && T.has(a)) return;
						a.remove();
					}
				});
			} catch (l) {
				if (l instanceof Promise && p) p(l);
				else throw l;
			}
		}), d = () => {
			for (const l of i) l();
			for (const l of s) l();
			i = [], s = [], u(), c.remove();
		};
		o.push(d);
	}
	return () => {
		for (const r of o) r();
		o = [];
	};
}
function ue({ children: e, target: t }) {
	let n;
	return Z(() => {
		n = S((t instanceof Function ? t() : t) ?? document.body, e);
	}), Y(() => {
		n();
	}), () => null;
}
var Ne = [
	se,
	fe,
	ue
];
function ae(e, t = {}) {
	if (!Ne.includes(e)) for (const n in t) t[n] = t[n] instanceof Function ? t[n]() : t[n];
}
var T = /* @__PURE__ */ new WeakSet();
function O(e, t, n) {
	const r = G(x$1());
	return K(r, () => {
		ae(e, t);
		const s = z(`root-${e.name}-${n?.toString()}`);
		t && n && (t.children = n);
		const c = U([X(() => e(t)), s]).flat();
		return T.add(s), we(s, r.cleanups), queueMicrotask(() => {
			s.parentNode && (h$1 || new MutationObserver((a) => {
				for (const p of a) for (const u of p.removedNodes) (u === s || !s.isConnected) && j$1(s);
			}).observe(s.parentNode, {
				childList: !0,
				subtree: !0
			}));
		}), c;
	});
}
function z(e, t = !1) {
	let n;
	return process.env.NODE_ENV === "development" && !t ? n = document.createComment(e) : n = document.createTextNode(""), T.add(n), n;
}
var $ = /* @__PURE__ */ new WeakMap();
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
		const r = () => {
			if (A$1().isHydrating) {
				requestAnimationFrame(r);
				return;
			}
			const s = b$2(() => {
				const i = t[o], c = typeof i == "function" && o !== "ref" ? i() : i;
				if (o.startsWith("on") && e instanceof HTMLElement) {
					const p = o.slice(2).toLowerCase();
					return be(e, p, c), () => Ce(e, p);
				}
				const a = e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement;
				if (o === "value" && a && typeof t.onInput != "function" && typeof t.onChange != "function") {
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
		r();
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
		const r = typeof o == "number", s = r && !De(n);
		e.style[n] = r ? s ? `${o}px` : `${o}` : String(o);
	}
}
function le(e, t = {}, n, o) {
	if (typeof e == "function") return O(e, {
		...t,
		key: o
	}, n);
	if (e === "html") return n;
	E.push(t.xmlns?.() ?? E[E.length - 1]);
	const r = $e(e), s = z("h-anchor", !0);
	r.appendChild(s);
	const i = S(r, n, s), c = Me(r, t);
	return queueMicrotask(() => {
		if (!r.parentNode) return;
		const a = new MutationObserver((p) => {
			for (const u of p) for (const d of u.removedNodes) r.isSameNode(d) && (i(), c(), a.disconnect());
		});
		a.observe(r.parentNode, {
			childList: !0,
			subtree: !0
		});
	}), E.pop(), r;
}
var E = [];
function $e(e) {
	const { currentNode: t, next: n } = A$1();
	if (t instanceof Element && !D) {
		if (t.tagName.toLowerCase() !== e) throw new Error("Hydration mismatch because the initial UI does not match what was rendered on the server");
		return n(), t;
	}
	const o = E[E.length - 1];
	return o ? document.createElementNS(o, e) : document.createElement(e);
}
function ke(e, t) {
	let n = [];
	return () => {
		const o = e() || [], r = o.length, s = new Array(r), i = /* @__PURE__ */ new Map();
		for (let u = 0; u < n.length; u++) {
			const d = n[u].value;
			i.has(d) || i.set(d, []), i.get(d).push(u);
		}
		const c = new Array(r).fill(-1);
		for (let u = 0; u < r; u++) {
			const d = o[u], l = i.get(d);
			if (l && l.length) {
				const f = l.shift();
				c[u] = f, s[u] = n[f];
			} else {
				const f = C$1(u);
				s[u] = {
					value: d,
					index: f,
					element: t(d, f)
				};
			}
		}
		const a = Ie(c);
		let p = a.length - 1;
		for (let u = r - 1; u >= 0; u--) {
			const d = s[u];
			if (c[u] === -1 || u !== a[p]) {
				const l = u + 1 < r ? s[u + 1].element : null;
				d.element.parentNode?.insertBefore(d.element, l);
			} else p--;
			d.index.value = u;
		}
		return n = s, n.map((u) => u.element);
	};
}
function Ie(e) {
	const t = e.slice(), n = [];
	let o, r;
	for (let s = 0; s < e.length; s++) {
		const i = e[s];
		if (!(i < 0)) {
			if (n.length === 0 || e[n[n.length - 1]] < i) {
				t[s] = n.length > 0 ? n[n.length - 1] : -1, n.push(s);
				continue;
			}
			for (o = 0, r = n.length - 1; o < r;) {
				const c = (o + r) / 2 | 0;
				e[n[c]] < i ? o = c + 1 : r = c;
			}
			i < e[n[o]] && (o > 0 && (t[s] = n[o - 1]), n[o] = s);
		}
	}
	for (o = n.length, r = n[o - 1]; o-- > 0;) n[o] = r, r = t[r];
	return n;
}
function fe({ each: e, children: t }) {
	const n = C$1([]), o = ke(e, t);
	return b$2(() => {
		n.value = o();
	}), () => n.value;
}
//#endregion
//#region ../../packages/vynn/dist/esm/index.js
var C = "lazy", M = "/lazy", P = (r, e = "default") => {
	let t, i, o, a = null;
	const n = () => {
		if (i) try {
			return i;
		} finally {
			i = void 0;
		}
		throw o || (a = r().then(async (s) => {
			if (!(e in s)) throw new Error(`lazy(): Export "${String(e)}" not found in module`);
			i = (() => {
				const u = W[t] || [];
				return ge([...A$1().renderedNodes, ...u]), W[t] = [], s[e]();
			});
		}).catch((s) => {
			o = s instanceof Error ? s : new Error(String(s));
		}), !R() && A$1().isHydrating ? Object.assign(a, { __fromLazy: !0 }) : a);
	};
	return () => {
		if (t ??= _().lazyID++, h$1 && !R()) throw new Promise(() => {});
		const s = n()();
		return R() ? () => [
			`<!--${C}:${t}-->`,
			s instanceof Function ? s() : s,
			`<!--${M}:${t}-->`
		] : s;
	};
};
var h = /* @__PURE__ */ new WeakMap();
function b$1(r) {
	function e(t) {
		if (h.has(t)) return h.get(t);
		const i = new Proxy(t, {
			get(o, a, n) {
				ee(o, a);
				const s = Reflect.get(o, a, n);
				if (typeof s == "function") return s.bind(n);
				const u = Reflect.getOwnPropertyDescriptor(o, a);
				return u?.get ? u.get.call(n) : typeof s == "object" && s !== null ? e(s) : s;
			},
			set(o, a, n, s) {
				const u = o[a], f = Reflect.set(o, a, n, s);
				return u !== n && ne(o, a), f;
			}
		});
		return h.set(t, i), i;
	}
	return e(r);
}
function A(r, e, t = !0) {
	const i = k$1(), o = _(), a = o.resourceID++, n = b$1({
		loading: !0,
		error: null,
		data: void 0,
		promiseStatus: "pending"
	});
	let s = null;
	const u = () => {
		const f = e.map((l) => l());
		X(() => {
			n.loading = !0, n.error = null, n.data = void 0, n.promiseStatus = "pending";
		}), !R() && !h$1 && window.__resource && window.__resource?.[a] && t ? (X(() => {
			n.data = window.__resource?.[a], n.error = null, n.promiseStatus = "fulfilled", n.loading = !1;
		}), delete window.__resource[a], window.__resource.length || delete window.__resource) : (s = X(() => r(...f)), s.then((l) => {
			X(() => {
				n.data = l, n.error = null, n.promiseStatus = "fulfilled", n.loading = !1;
			}), R() && t && i.controller.enqueue(i.encoder.encode(`<script>window.__resource ??= []; window.__resource[${a}] = ${JSON.stringify(l)};document.currentScript.remove();<\/script>`));
		}).catch((l) => {
			X(() => {
				n.data = void 0, n.error = l, n.promiseStatus = "rejected", n.loading = !1;
			});
		}));
	};
	return b$2(() => {
		u();
	}), {
		get loading() {
			return n.loading;
		},
		get error() {
			return n.error;
		},
		get data() {
			if (n.promiseStatus === "pending") throw s;
			if (n.promiseStatus === "rejected") throw n.error;
			return n.data;
		},
		refetch: u,
		mutate(f) {
			n.data = f;
		}
	};
}
function L() {
	const r = Symbol();
	return {
		id: r,
		Provider: (e) => () => (N(r, e.value), e.children)
	};
}
function F(r) {
	return H$1(r.id);
}
function q(r) {
	const e = C$1();
	return b$2(() => {
		e.value = r();
	}), { get value() {
		return e.value;
	} };
}
function H(r) {
	const e = _().memo;
	function t(i) {
		h$1 || Y(() => {
			e.delete(t);
		});
		let o = e.get(t);
		return o || (o = {
			lastProps: void 0,
			hasLast: !1,
			lastResult: void 0
		}, e.set(t, o)), o.hasLast && w$1(o.lastProps, i) || (o.lastProps = i, o.lastResult = r(i), o.hasLast = !0), o.lastResult;
	}
	return t;
}
function w$1(r, e) {
	if (r === e || r !== r && e !== e) return !0;
	if (r == null || e == null) return !1;
	if (r instanceof Date && e instanceof Date) return r.getTime() === e.getTime();
	if (r instanceof RegExp && e instanceof RegExp) return r.toString() === e.toString();
	if (Array.isArray(r) && Array.isArray(e)) {
		if (r.length !== e.length) return !1;
		for (let t = 0; t < r.length; t++) if (!w$1(r[t], e[t])) return !1;
		return !0;
	}
	if (typeof r == "object" && typeof e == "object" && r.constructor === Object && e.constructor === Object) {
		const t = Object.keys(r), i = Object.keys(e);
		if (t.length !== i.length) return !1;
		for (const o of t) if (!Object.prototype.hasOwnProperty.call(e, o) || !w$1(r[o], e[o])) return !1;
		return !0;
	}
	return !1;
}
//#endregion
//#region ../../packages/vynn/dist/esm/chunks/C3r9Tuu0.js
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
var b = new Set([
	"title",
	"meta",
	"script",
	"style"
]);
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
		const r = re(s, b.has(t));
		L$1(r) || n.push(r);
	}
	for (const [e] of n.entries()) n[e] && n[e + 1] && oe(n[e]) && oe(n[e + 1]) && n.splice(e + 1, 0, "<!--split-->");
	return n.join("") || null;
}
function w(t, o, n) {
	ae(t, o);
	return K(G(x$1()), () => (o && n && (o.children = n), X(() => t(o))));
}
var j = new Set([
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
function k(t, o = {}, n, e) {
	if (typeof t == "function") return w(t, {
		...o,
		key: e
	}, n);
	if (j.has(t)) return `<${t}${a(o)}>`;
	const s = u(t, "html" in o ? o.html : n) || "";
	return `<${t}${a(o)}>${s}</${t}>`;
}
//#endregion
//#region ../../packages/vynn/dist/esm/server/jsx-runtime.js
var x = (s, { children: r, ...o } = {}, a) => h$1 ? k(s, o, r, a) : le(s, o, r, a);
//#endregion
//#region ../../packages/vynn-router/dist/esm/index.jsx
var isServer = typeof window === "undefined";
var $location = b$1({
	pathname: !isServer ? window.location.pathname : "/",
	search: !isServer ? window.location.search : ""
});
if (!isServer) window.addEventListener("popstate", () => {
	$location.pathname = window.location.pathname;
	$location.search = window.location.search;
});
function navigate(path) {
	if (path === $location.pathname) return;
	if (!isServer) {
		history.pushState(null, "", path);
		$location.pathname = path;
		$location.search = window.location.search;
	} else $location.pathname = path;
}
function isActiveRoute(targetpath) {
	const pathname = $location.pathname;
	if (targetpath === "/") return targetpath === pathname;
	function toSegment(fullpath) {
		return fullpath.split("/").filter(Boolean).map((path) => `${path}`);
	}
	const pathnameSegment = toSegment(pathname);
	const targetnameSegment = toSegment(targetpath);
	if (pathnameSegment.length !== targetnameSegment.length) return false;
	return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}
function matchRoute(targetpath) {
	const pathname = $location.pathname;
	if (targetpath === "/") return pathname.startsWith("/");
	function toSegment(fullpath) {
		return fullpath.split("/").filter(Boolean).map((path) => `${path}`);
	}
	const pathnameSegment = toSegment(pathname);
	return toSegment(targetpath).every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}
var resolve = (routes) => {
	let oldPath;
	const view = C$1(() => null);
	b$2(() => {
		for (const route of routes) if (matchRoute(route.path)) {
			if (oldPath !== route.path) {
				oldPath = route.path;
				const children = (route.children || []).map((childRoute) => {
					return {
						...childRoute,
						path: (route.path === "/" ? "" : route.path) + childRoute.path
					};
				});
				view.value = () => route.component({ children: () => resolve(children) });
			}
		}
	});
	return () => {
		const Component = view.value;
		return () => /* @__PURE__ */ x(Component, {});
	};
};
function Router(props) {
	if (props.url) $location.pathname = props.url;
	return () => /* @__PURE__ */ x(r, { children: () => resolve(props.routes) });
}
//#endregion
//#region ../@components/src/components/Template.tsx
var Template = ({ title, children }) => {
	return () => /* @__PURE__ */ x("div", {
		class: () => "p-2 w-full",
		children: () => [() => /* @__PURE__ */ x("h1", {
			class: () => "font-bold text-2xl mb-2",
			children: () => title
		}), () => children()]
	});
};
//#endregion
//#region ../@components/src/components/ButtonPageList.tsx
var ButtonPageList = () => {
	return () => /* @__PURE__ */ x(Template, {
		title: () => "Pages",
		children: () => /* @__PURE__ */ x("ul", {
			class: () => "flex flex-col gap-2",
			children: () => [
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/"),
					disabled: () => isActiveRoute("/"),
					children: () => "All"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/lazy"),
					disabled: () => isActiveRoute("/lazy"),
					children: () => "Lazy"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/forms"),
					disabled: () => isActiveRoute("/forms"),
					children: () => "Forms"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/contexts"),
					disabled: () => isActiveRoute("/contexts"),
					children: () => "Contexts"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/dropdown-list"),
					disabled: () => isActiveRoute("/dropdown-list"),
					children: () => "Dropdown Lists"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/non-async-suspense"),
					disabled: () => isActiveRoute("/non-async-suspense"),
					children: () => "Non Async Suspense"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/stacked-suspense"),
					disabled: () => isActiveRoute("/stacked-suspense"),
					children: () => "Stacked Suspense"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/poke-dex"),
					disabled: () => isActiveRoute("/poke-dex"),
					children: () => "PokeDex List"
				}) }),
				() => /* @__PURE__ */ x("li", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => navigate("/poke-dex-suspense"),
					disabled: () => isActiveRoute("/poke-dex-suspense"),
					children: () => "PokeDex List with Suspense"
				}) })
			]
		})
	});
};
//#endregion
//#region ../@components/src/pages/Contexts.tsx
var Contexts = H(() => {
	return () => /* @__PURE__ */ x(Template, {
		title: () => "Contexts",
		children: () => [() => /* @__PURE__ */ x(Form, { children: () => /* @__PURE__ */ x(Input$1, {}) }), () => /* @__PURE__ */ x(Form, { children: () => /* @__PURE__ */ x(Wrapper, { children: () => /* @__PURE__ */ x(Input$1, {}) }) })]
	});
});
var NameContext = L();
var Form = H(({ children }) => {
	const state = b$1({ name: "asd" });
	return () => /* @__PURE__ */ x(NameContext.Provider, {
		value: () => state,
		children: () => children()
	});
});
function Wrapper({ children }) {
	return () => /* @__PURE__ */ x(r, { children: () => [
		() => /* @__PURE__ */ x("div", { children: () => "Hi" }),
		() => " ",
		() => children()
	] });
}
var Input$1 = H(() => {
	const forms = F(NameContext);
	const i = C$1(0);
	const cleanup = setInterval(() => {
		i.value++;
	}, 1e3);
	Y(() => {
		console.log("cleared tanga");
		clearInterval(cleanup);
	});
	const nameEl = () => /* @__PURE__ */ x("div", { children: () => [
		() => "Name: ",
		() => forms.name,
		() => " Hi"
	] });
	console.log("hi");
	return () => /* @__PURE__ */ x(r, { children: () => [
		() => /* @__PURE__ */ x("div", { children: () => [() => "Name: ", () => forms.name] }),
		() => nameEl,
		() => /* @__PURE__ */ x("input", {
			type: () => "text",
			name: () => "name",
			onInput: () => (event) => forms.name = event.currentTarget.value,
			placeholder: () => "name",
			autoComplete: () => "off",
			value: () => forms.name
		}),
		" ",
		() => i.value
	] });
});
//#endregion
//#region ../@components/src/utils/global-state.ts
var name = b$1({
	firstName: "First name",
	lastName: "Last name"
});
//#endregion
//#region ../@components/src/utils/sleep.ts
var sleep = (ms) => new Promise((resolve) => {
	setTimeout(resolve, ms);
});
//#endregion
//#region ../@components/src/pages/DropdownList.tsx
var Dropdowns = H(() => {
	console.log("Dropdown rerender");
	const dropdownStore = b$1({
		showDropdown: false,
		sortDirection: "asc",
		numbers: [
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8
		],
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
			if (!currentNumbers.length) this.numbers = [1];
			else this.numbers = [...currentNumbers, currentNumbers[currentNumbers.length - 1] + 1];
		},
		removeDropdown() {
			if (this.numbers.length > 0) this.numbers = this.numbers.slice(0, -1);
		}
	});
	b$2(() => {
		console.log(dropdownStore.numbers);
	});
	return () => /* @__PURE__ */ x(Template, {
		title: () => "Dropdown List",
		children: () => /* @__PURE__ */ x("div", {
			class: () => "flex flex-col gap-4",
			children: () => [
				() => /* @__PURE__ */ x("div", { children: () => /* @__PURE__ */ x("div", {
					class: () => "flex gap-2 items-center",
					children: () => [
						() => /* @__PURE__ */ x("span", { children: () => "Add Dropdown" }),
						() => /* @__PURE__ */ x("button", {
							class: () => "btn",
							onClick: () => dropdownStore.addDropdown,
							children: () => "+"
						}),
						() => /* @__PURE__ */ x("button", {
							class: () => "btn",
							onClick: () => dropdownStore.removeDropdown,
							children: () => "-"
						})
					]
				}) }),
				() => /* @__PURE__ */ x("div", {
					class: () => "flex gap-2 items-center",
					children: () => [
						() => /* @__PURE__ */ x("span", { children: () => "Sort" }),
						() => /* @__PURE__ */ x("button", {
							class: () => "btn",
							onClick: () => dropdownStore.handleSort,
							children: () => dropdownStore.sortDirection === "asc" ? "↑" : "↓"
						}),
						() => /* @__PURE__ */ x("button", {
							class: () => "btn",
							onClick: () => dropdownStore.handleRandomize,
							children: () => "Randomize"
						})
					]
				}),
				() => /* @__PURE__ */ x("div", { children: () => /* @__PURE__ */ x("button", {
					onClick: () => () => dropdownStore.showDropdown = !dropdownStore.showDropdown,
					children: () => "Unmount Dropdown List"
				}) }),
				() => dropdownStore.showDropdown && /* @__PURE__ */ x(DropdownList, { dropdowns: () => dropdownStore }),
				() => /* @__PURE__ */ x("div", { children: () => "Hi" })
			]
		})
	});
});
var DropdownList = H(({ dropdowns }) => {
	console.log("weh");
	return () => /* @__PURE__ */ x("div", {
		class: () => "flex gap-2 flex-col lg:flex-row",
		children: () => dropdowns.numbers.map((number) => /* @__PURE__ */ x(Dropdown, { number: () => number }, () => number))
	});
});
var Dropdown = H(({ number }) => {
	console.log("rerender");
	const isOpen = C$1(false);
	const handleToggle = () => {
		isOpen.value = !isOpen.value;
	};
	return () => /* @__PURE__ */ x(r, { children: () => /* @__PURE__ */ x("div", {
		class: () => "relative lg:w-[calc(100%/8)]",
		children: () => [() => /* @__PURE__ */ x("div", { children: () => [() => /* @__PURE__ */ x("button", {
			class: () => "btn w-full",
			onClick: () => handleToggle,
			children: () => [() => "Open Dropdown ", () => number]
		}), () => /* @__PURE__ */ x("div", {
			class: () => "break-all",
			children: () => [() => "Hi ", () => name.firstName]
		})] }), () => isOpen.value && /* @__PURE__ */ x("div", {
			class: () => "absolute bg-white border border-gray-200 rounded p-4 w-[200px] z-10",
			children: () => /* @__PURE__ */ x("ul", { children: () => Array.from({ length: 3 }).map((_, i) => i + 1).map((item) => /* @__PURE__ */ x("li", {
				class: () => "cursor-pointer p-2 rounded hover:bg-gray-100",
				children: () => [() => "Dropdown ", () => item]
			})) })
		})]
	}) });
});
//#endregion
//#region ../@components/src/pages/Forms.tsx
var Forms = H(() => {
	return () => /* @__PURE__ */ x(Template, {
		title: () => "Forms",
		children: () => /* @__PURE__ */ x("div", { children: () => [() => /* @__PURE__ */ x("div", { children: () => [() => /* @__PURE__ */ x("label", {
			class: () => "break-all",
			for: () => "name-input2",
			children: () => [() => "Hi ", () => name.firstName]
		}), () => /* @__PURE__ */ x("div", { children: () => /* @__PURE__ */ x("input", {
			type: () => "text",
			value: () => name.firstName,
			id: () => "name-input2"
		}) })] }), () => /* @__PURE__ */ x("div", { children: () => [() => /* @__PURE__ */ x(Counter, {}, () => 1), () => /* @__PURE__ */ x(Input, {}, () => 2)] })] })
	});
});
var Counter = H(() => {
	const count = C$1(0);
	const double = q(() => count.value * 2);
	const handleCount = () => {
		count.value++;
	};
	b$2(() => {});
	b$2(() => {});
	console.log("rerender?");
	return () => /* @__PURE__ */ x(r, { children: () => [
		() => count.value,
		() => /* @__PURE__ */ x("div", { children: () => [() => "Count: ", () => count.value] }),
		() => /* @__PURE__ */ x("div", { children: () => [() => "Double Count: ", () => double.value] }),
		() => /* @__PURE__ */ x("button", {
			disabled: () => count.value >= 5,
			onClick: () => handleCount,
			children: () => "Add counter"
		}),
		() => /* @__PURE__ */ x("div", { children: () => count.value <= 3 ? /* @__PURE__ */ x("div", { children: () => "Hi" }) : "string" })
	] });
});
var Input = H(() => {
	return () => /* @__PURE__ */ x("div", { children: () => [() => /* @__PURE__ */ x("label", {
		class: () => "break-all",
		for: () => "name-input",
		children: () => [
			() => "Name ",
			() => name.firstName,
			() => " ",
			() => /* @__PURE__ */ x("span", { children: () => "Hi" })
		]
	}), () => /* @__PURE__ */ x("div", { children: () => /* @__PURE__ */ x("input", {
		id: () => "name-input",
		type: () => "text",
		onInput: () => (event) => {
			name.firstName = event.currentTarget.value;
		},
		value: () => name.firstName
	}) })] });
});
//#endregion
//#region ../@components/src/pages/Lazy.tsx
var LazyImport = P(() => import("./assets/LazyImport-D6R9p3jx.js"), "LazyImport");
var LazyTest = P(() => import("./assets/Test-CeZTLUoh.js"), "Test");
var Lazy = () => {
	return () => /* @__PURE__ */ x(Template, {
		title: () => "Lazy",
		children: () => /* @__PURE__ */ x("div", { children: () => [
			() => /* @__PURE__ */ x(se, {
				fallback: () => "Tester",
				children: () => /* @__PURE__ */ x(LazyImport, {})
			}),
			() => /* @__PURE__ */ x(se, {
				fallback: () => "Tester2",
				children: () => /* @__PURE__ */ x(LazyTest, {})
			}),
			() => /* @__PURE__ */ x("h5", { children: () => "Test" })
		] })
	});
};
//#endregion
//#region ../@components/src/pages/NonAsyncSuspense.tsx
function NonAsyncSuspense() {
	return () => /* @__PURE__ */ x(Template, {
		title: () => "Non-Async Suspense",
		children: () => /* @__PURE__ */ x("div", { children: () => /* @__PURE__ */ x(se, {
			fallback: () => /* @__PURE__ */ x("div", { children: () => "hi" }),
			children: () => /* @__PURE__ */ x("div", { children: () => "Children" })
		}) })
	});
}
//#endregion
//#region ../@components/src/pages/PokeDex.tsx
var PokeDex = () => {
	const pokeDex = b$1({
		isLoading: true,
		pokeDexList: [],
		prevLink: "",
		nextLink: "",
		sortDirection: "asc",
		async fetchData(url, controller) {
			if (!url) return;
			this.isLoading = true;
			const json = await (await fetch(url, { signal: controller?.signal })).json();
			await sleep(0);
			this.pokeDexList = json.results;
			this.prevLink = json.previous?.replace(/limit=\d+/, "limit=20") ?? "";
			this.nextLink = json.next?.replace(/limit=\d+/, "limit=20") ?? "";
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
		children: () => [
			() => /* @__PURE__ */ x("div", {
				class: () => "break-all",
				children: () => [() => "Hi ", () => name.firstName]
			}),
			() => /* @__PURE__ */ x("table", {
				class: () => "w-full mx-auto my-2 table-fixed",
				children: () => [() => /* @__PURE__ */ x("thead", { children: () => /* @__PURE__ */ x("tr", { children: () => [
					() => /* @__PURE__ */ x("th", {
						class: () => "w-1/3",
						children: () => "ID"
					}),
					() => /* @__PURE__ */ x("th", {
						onClick: () => sortOnClick("name"),
						class: () => "select-none cursor-pointer w-1/3",
						children: () => "Name"
					}),
					() => /* @__PURE__ */ x("th", {
						onClick: () => sortOnClick("url"),
						class: () => "select-none cursor-pointer w-1/3",
						children: () => "URL"
					})
				] }) }), () => /* @__PURE__ */ x("tbody", { children: () => [() => pokeDex.isLoading && /* @__PURE__ */ x(r, { children: () => Array.from({ length: 20 }).map((_, i) => i + 1).map((number) => /* @__PURE__ */ x("tr", { children: () => /* @__PURE__ */ x("td", {
					colSpan: () => 3,
					class: () => "h-[24px] text-center",
					children: () => number === 10 && "loading..."
				}) })) }), () => !pokeDex.isLoading && /* @__PURE__ */ x(r, { children: () => pokeDex.pokeDexList.map(({ name, url }, index) => /* @__PURE__ */ x("tr", { children: () => [
					() => /* @__PURE__ */ x("td", {
						class: () => "w-1/3 text-center",
						children: () => index + 1
					}),
					() => /* @__PURE__ */ x("td", {
						class: () => "w-1/3 text-center truncate",
						children: () => name
					}),
					() => /* @__PURE__ */ x("td", {
						class: () => "w-1/3 text-center truncate",
						onClick: () => showUrlOnClick(url),
						children: () => url
					})
				] })) })] })]
			}),
			() => /* @__PURE__ */ x("div", {
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
			})
		]
	});
};
//#endregion
//#region ../@components/src/pages/PokeDexSuspense.tsx
var PokeDexSuspense = H(() => {
	const pokeDex = b$1({
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
	const pokeDexResource = A(async (url) => {
		return await (await fetch(url)).json();
	}, [() => pokeDex.url]);
	const showUrlOnClick = (url) => () => alert(url);
	const sortOnClick = (key) => () => pokeDex.sort(key);
	Y(() => {
		console.log("pokedex-suspense destroyed");
	});
	return () => /* @__PURE__ */ x(Template, {
		title: () => "PokeDex List (via Suspense)",
		children: () => /* @__PURE__ */ x("div", { children: () => [
			() => /* @__PURE__ */ x("div", {
				class: () => "break-all",
				children: () => [() => "Hi ", () => name.firstName]
			}),
			() => /* @__PURE__ */ x("table", {
				class: () => "w-full mx-auto my-2 table-fixed",
				children: () => [() => /* @__PURE__ */ x("thead", { children: () => /* @__PURE__ */ x("tr", { children: () => [
					() => /* @__PURE__ */ x("th", {
						class: () => "w-1/3",
						children: () => "ID"
					}),
					() => /* @__PURE__ */ x("th", {
						onClick: () => sortOnClick("name"),
						class: () => "select-none cursor-pointer w-1/3",
						children: () => "Name"
					}),
					() => /* @__PURE__ */ x("th", {
						onClick: () => sortOnClick("url"),
						class: () => "select-none cursor-pointer w-1/3",
						children: () => "URL"
					})
				] }) }), () => /* @__PURE__ */ x("tbody", { children: () => /* @__PURE__ */ x(se, {
					fallback: () => /* @__PURE__ */ x(r, { children: () => Array.from({ length: 20 }).map((_, i) => i + 1).map((number) => /* @__PURE__ */ x("tr", { children: () => /* @__PURE__ */ x("td", {
						colSpan: () => 3,
						class: () => "h-[24px] text-center",
						children: () => number === 10 && "loading..."
					}) })) }),
					children: () => /* @__PURE__ */ x(r, { children: () => pokeDexResource.data.results.map(({ name, url }, index) => /* @__PURE__ */ x("tr", { children: () => [
						() => /* @__PURE__ */ x("td", {
							class: () => "w-1/3 text-center",
							children: () => index + 1
						}),
						() => /* @__PURE__ */ x("td", {
							class: () => "w-1/3 text-center truncate",
							children: () => name
						}),
						() => /* @__PURE__ */ x("td", {
							class: () => "w-1/3 text-center truncate",
							onClick: () => showUrlOnClick(url),
							children: () => url
						})
					] })) })
				}) })]
			}),
			() => /* @__PURE__ */ x("div", {
				class: () => "flex gap-4 justify-center",
				children: () => [() => /* @__PURE__ */ x("button", {
					class: () => "btn",
					onClick: () => () => {
						pokeDex.changeUrl(pokeDexResource.data?.previous);
					},
					disabled: () => pokeDexResource.loading || !pokeDexResource.data?.previous,
					children: () => "Previous"
				}), () => /* @__PURE__ */ x("button", {
					class: () => "btn",
					onClick: () => () => {
						pokeDex.changeUrl(pokeDexResource.data?.next);
					},
					disabled: () => pokeDexResource.loading || !pokeDexResource.data?.next,
					children: () => "Next"
				})]
			})
		] })
	});
});
//#endregion
//#region ../@components/src/pages/StackedSuspense.tsx
var StackedSuspense = H(() => {
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
			children: () => [
				() => /* @__PURE__ */ x(se, {
					fallback: () => "Lick my ass",
					children: () => /* @__PURE__ */ x("input", {
						onInput: () => (event) => {
							msg2.mutate(event.currentTarget.value.toString());
						},
						value: () => msg2.data
					})
				}),
				() => /* @__PURE__ */ x(se, {
					fallback: () => "Ngee",
					children: () => msg3.data
				}),
				() => /* @__PURE__ */ x(se, {
					fallback: () => /* @__PURE__ */ x("div", { children: () => "loading 1..." }),
					children: () => [
						() => /* @__PURE__ */ x("div", { children: () => "hi" }),
						() => /* @__PURE__ */ x(Component, {}),
						() => /* @__PURE__ */ x(se, {
							fallback: () => /* @__PURE__ */ x("div", { children: () => "loading 2..." }),
							children: () => msg2.data
						})
					]
				})
			]
		})
	});
});
var Component = H(() => {
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
	return () => /* @__PURE__ */ x("div", { children: () => msg.data });
});
//#endregion
//#region ../@components/src/routes.tsx
var routes = [{
	path: "/",
	component: ({ children }) => {
		console.log("layout rerender");
		return () => /* @__PURE__ */ x("div", {
			class: () => "p-2 flex flex-col container m-auto",
			children: () => [() => /* @__PURE__ */ x(ButtonPageList, {}), () => /* @__PURE__ */ x("div", { children: () => [() => /* @__PURE__ */ x("img", {
				src: () => "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRpLi7keg1UMUkBEw-Y1jo04fSydwwnLocNSQ&s",
				alt: () => "monday left me broken",
				fetchpriority: () => "high"
			}), () => children()] })]
		});
	},
	children: [
		{
			path: "/",
			component: () => /* @__PURE__ */ x(r, { children: () => [
				() => /* @__PURE__ */ x(Lazy, {}),
				() => /* @__PURE__ */ x(Forms, {}),
				() => /* @__PURE__ */ x(Contexts, {}),
				() => /* @__PURE__ */ x(Dropdowns, {}),
				() => /* @__PURE__ */ x(NonAsyncSuspense, {}),
				() => /* @__PURE__ */ x(StackedSuspense, {}),
				() => /* @__PURE__ */ x(PokeDex, {}),
				() => /* @__PURE__ */ x(PokeDexSuspense, {})
			] })
		},
		{
			path: "/lazy",
			component: Lazy
		},
		{
			path: "/contexts",
			component: Contexts
		},
		{
			path: "/stacked-suspense",
			component: StackedSuspense
		},
		{
			path: "/poke-dex",
			component: PokeDex
		},
		{
			path: "/poke-dex-suspense",
			component: PokeDexSuspense
		},
		{
			path: "/dropdown-list",
			component: Dropdowns
		},
		{
			path: "/forms",
			component: Forms
		},
		{
			path: "/non-async-suspense",
			component: NonAsyncSuspense
		}
	]
}];
//#endregion
//#region ../@components/src/App.tsx
function App({ url }) {
	const show = C$1(true);
	return () => /* @__PURE__ */ x("div", { children: () => [() => show.value && /* @__PURE__ */ x(Router, {
		url: () => url,
		routes: () => routes
	}), () => /* @__PURE__ */ x("button", {
		onClick: () => () => show.value = !show.value,
		children: () => "Toggle"
	})] });
}
//#endregion
//#region ../../packages/vynn/dist/esm/server.js
function g(t) {
	return he(!0), me(), new ReadableStream({ async start(n) {
		const o = new AsyncLocalStorage(), s = new TextEncoder();
		globalThis.__stream_context = {
			encoder: s,
			controller: n,
			promises: []
		}, o.run(globalThis.__stream_context, () => {
			const c = o.getStore();
			globalThis.__stream_context = c;
			try {
				const r = y(t()) || "";
				n.enqueue(s.encode(r)), m(() => {
					ve(), n.close();
				});
			} catch (r) {
				console.error("renderToStream error:", r);
			}
		});
	} });
}
function m(t) {
	queueMicrotask(async () => {
		await globalThis.__stream_context.promises.pop(), globalThis.__stream_context.promises.length ? m(t) : t();
	});
}
//#endregion
//#region src/entry-server.tsx
var render = (url) => {
	return g(() => /* @__PURE__ */ x(App, { url: () => url }));
};
//#endregion
export { C$1 as a, se as c, P as i, r as l, F as n, Z as o, L as r, render, b$2 as s, x as t };
