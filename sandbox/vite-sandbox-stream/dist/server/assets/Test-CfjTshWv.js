import { o as onMount, a as $effect, j as jsx } from "../entry-server.js";
import "async_hooks";
function Test() {
  onMount(() => {
  });
  $effect(() => {
  });
  return () => /* @__PURE__ */ jsx("div", {
    children: () => /* @__PURE__ */ jsx("test", {
      children: () => "Test me sheet"
    })
  });
}
export {
  Test
};
