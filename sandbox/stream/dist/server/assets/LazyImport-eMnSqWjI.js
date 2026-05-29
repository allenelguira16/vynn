import { x, Z, C, m, E, s as se, r, a as C$1, M } from "../entry-server.js";
import "async_hooks";
const [Provider, context] = C$1();
function LazyImport() {
  const name = x("test");
  Z(() => {
  });
  C(() => {
  });
  return () => /* @__PURE__ */ m(Provider, {
    value: () => name,
    children: () => /* @__PURE__ */ m(Children, {})
  });
}
const Test2 = M(() => import("./Test2-BzEfc-zr.js"), "Test2");
const Children = E(() => {
  const name = context();
  return () => /* @__PURE__ */ m(r, {
    children: () => [() => /* @__PURE__ */ m("div", {
      children: () => [() => "Hi I'm ", () => name.value, () => " and I'm from LazyImport"]
    }), () => /* @__PURE__ */ m("input", {
      onInput: () => (event) => name.value = event.currentTarget.value,
      value: () => name.value
    }), () => /* @__PURE__ */ m(se, {
      children: () => /* @__PURE__ */ m(Test2, {})
    })]
  });
});
export {
  LazyImport
};
