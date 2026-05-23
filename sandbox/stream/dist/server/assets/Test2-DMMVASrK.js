import { o as onMount, $ as $effect, j as jsx, F as Fragment } from "../entry-server.js";
import "async_hooks";
function Test2() {
  onMount(() => {
  });
  $effect(() => {
  });
  return () => /* @__PURE__ */ jsx(Fragment, {
    children: () => /* @__PURE__ */ jsx("div", {
      children: () => "Test2 me sheet"
    })
  });
}
export {
  Test2
};
