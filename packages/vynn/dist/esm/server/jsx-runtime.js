export { F as Fragment } from '../chunks/C-2wWVT5.js';
import { j as isServer, h as h$1 } from '../chunks/CkvSgCt_.js';
export { m as logJsx } from '../chunks/CkvSgCt_.js';
import { h } from '../chunks/BJBPOMhh.js';

const jsx = (type, { children, ...props } = {}, key) => {
  if (isServer) {
    return h(type, props, children, key);
  }
  return h$1(type, props, children);
};

export { jsx, jsx as jsxs };
//# sourceMappingURL=jsx-runtime.js.map
