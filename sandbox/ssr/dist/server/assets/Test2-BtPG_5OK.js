import { Z, C, m, r } from "../entry-server.js";
function Test2() {
  Z(() => {
  });
  C(() => {
  });
  return () => /* @__PURE__ */ m(r, {
    children: () => /* @__PURE__ */ m("div", {
      children: () => "Test2 me sheet"
    })
  });
}
export {
  Test2
};
