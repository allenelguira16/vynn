import { C, Z, b, x, F, s as se, r, L, P } from "../entry-server.js";
import "async_hooks";
const NameProvider = L();
function LazyImport() {
  const name = C("test");
  Z(() => {
  });
  b(() => {
  });
  return () => /* @__PURE__ */ x(NameProvider.Provider, {
    value: () => name,
    children: () => /* @__PURE__ */ x(Children, {})
  });
}
const Test2 = P(() => import("./Test2-BnRtmUTZ.js"), "Test2");
const Children = () => {
  const name = F(NameProvider);
  return () => /* @__PURE__ */ x(r, {
    children: () => [() => /* @__PURE__ */ x("div", {
      children: () => [() => "Hi I'm ", () => name.value, () => " and I'm from LazyImport"]
    }), () => /* @__PURE__ */ x("input", {
      onInput: () => (event) => name.value = event.currentTarget.value,
      value: () => name.value
    }), () => /* @__PURE__ */ x(se, {
      children: () => /* @__PURE__ */ x(Test2, {})
    })]
  });
};
export {
  LazyImport
};
