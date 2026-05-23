import { a as $state, o as onMount, $ as $effect, j as jsx, l as lazy, S as Suspense, F as Fragment, c as createContext } from "../entry-server.js";
import "async_hooks";
const [Provider, context] = createContext();
function LazyImport() {
  const name = $state("test");
  onMount(() => {
  });
  $effect(() => {
  });
  return () => /* @__PURE__ */ jsx(Provider, {
    value: () => name,
    children: () => /* @__PURE__ */ jsx(Children, {})
  });
}
const Test2 = lazy(() => import("./Test2-DMMVASrK.js"), "Test2");
function Children() {
  const name = context();
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => [() => /* @__PURE__ */ jsx("div", {
      children: () => [() => "Hi I'm ", () => name.value, () => " and I'm from LazyImport"]
    }), () => /* @__PURE__ */ jsx("input", {
      onInput: () => (event) => name.value = event.currentTarget.value,
      value: () => name.value
    }), () => /* @__PURE__ */ jsx(Suspense, {
      children: () => /* @__PURE__ */ jsx(Test2, {})
    })]
  });
}
export {
  LazyImport
};
