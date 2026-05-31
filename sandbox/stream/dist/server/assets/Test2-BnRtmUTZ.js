import { Z, b, x, r } from "../entry-server.js";
import "async_hooks";
function Test2() {
  Z(() => {
  });
  b(() => {
  });
  return () => /* @__PURE__ */ x(r, {
    children: () => /* @__PURE__ */ x("div", {
      children: () => "Test2 me sheet"
    })
  });
}
export {
  Test2
};
