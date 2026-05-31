import { Z, b, x } from "../entry-server.js";
import "async_hooks";
const Test = () => {
  Z(() => {
  });
  b(() => {
  });
  return () => /* @__PURE__ */ x("div", {
    children: () => /* @__PURE__ */ x("test", {
      children: () => "Test me sheet"
    })
  });
};
export {
  Test
};
