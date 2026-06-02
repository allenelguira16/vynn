import { a as C, c as se, i as P, l as r, n as F, o as Z, r as L, s as b, t as x } from "../entry-server.js";
//#region ../@components/src/components/LazyImport.tsx
var NameProvider = L();
function LazyImport() {
	const name = C("test");
	Z(() => {});
	b(() => {});
	return () => /* @__PURE__ */ x(NameProvider.Provider, {
		value: () => name,
		children: () => /* @__PURE__ */ x(Children, {})
	});
}
var Test2 = P(() => import("./Test2-Bk36aprf.js"), "Test2");
var Children = () => {
	const name = F(NameProvider);
	return () => /* @__PURE__ */ x(r, { children: () => [
		() => /* @__PURE__ */ x("div", { children: () => [
			() => "Hi I'm ",
			() => name.value,
			() => " and I'm from LazyImport"
		] }),
		() => /* @__PURE__ */ x("input", {
			onInput: () => (event) => name.value = event.currentTarget.value,
			value: () => name.value
		}),
		() => /* @__PURE__ */ x(se, { children: () => /* @__PURE__ */ x(Test2, {}) })
	] });
};
//#endregion
export { LazyImport };
