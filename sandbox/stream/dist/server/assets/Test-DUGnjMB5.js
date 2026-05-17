import { c as ce, L, a } from "../entry-server.js";
import "async_hooks";
function Test() {
  ce(() => {
  });
  L(() => {
  });
  return () => /* @__PURE__ */ a("div", {
    children: () => /* @__PURE__ */ a("test", {
      children: () => "Test me sheet"
    })
  });
}
export {
  Test
};
