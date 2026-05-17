import { c as ce, L, a, r } from "../entry-server.js";
import "async_hooks";
function Test2() {
  ce(() => {
  });
  L(() => {
  });
  return () => /* @__PURE__ */ a(r, {
    children: () => /* @__PURE__ */ a("div", {
      children: () => "Test2 me sheet"
    })
  });
}
export {
  Test2
};
