'use strict';

var fragment = require('../chunks/Bp5SZ2VF.js');
var logJsx = require('../chunks/BMPDAHvm.js');
var h = require('../chunks/DOPi4EeN.js');

const jsx = (type, { children, ...props } = {}, key) => {
  if (logJsx.isServer) {
    return h.h(type, props, children, key);
  }
  return logJsx.h(type, props, children);
};

exports.Fragment = fragment.Fragment;
exports.logJsx = logJsx.logJsx;
exports.jsx = jsx;
exports.jsxs = jsx;
//# sourceMappingURL=jsx-runtime.js.map
