import { A, c as ce, L, a, b as L$1, P, Y, r } from "../entry-server.js";
import "async_hooks";
const [Provider, context] = L$1();
function LazyImport() {
  const name = A("test");
  ce(() => {
  });
  L(() => {
  });
  return () => /* @__PURE__ */ a(Provider, {
    value: () => name,
    children: () => /* @__PURE__ */ a(Children, {})
  });
}
const Test2 = P(() => import("./Test2-C4FF18nB.js"), "Test2");
function Children() {
  const name = context();
  return () => /* @__PURE__ */ a(r, {
    children: () => [() => /* @__PURE__ */ a("div", {
      children: () => [() => "Hi I'm ", () => name.value, () => " and I'm from LazyImport"]
    }), () => /* @__PURE__ */ a("input", {
      onInput: () => (event) => name.value = event.currentTarget.value,
      value: () => name.value
    }), () => /* @__PURE__ */ a(Y, {
      children: () => /* @__PURE__ */ a(Test2, {})
    })]
  });
}
export {
  LazyImport
};
