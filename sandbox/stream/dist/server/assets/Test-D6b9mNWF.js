import { Z, C, m } from "../entry-server.js";
import "async_hooks";
const Test = () => {
  Z(() => {
  });
  C(() => {
  });
  return () => /* @__PURE__ */ m("div", {
    children: () => /* @__PURE__ */ m("test", {
      children: () => "Test me sheet"
    })
  });
};
export {
  Test
};
