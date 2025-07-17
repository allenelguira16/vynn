import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";

export const pureJsxCallsPlugin = declare((api) => {
  api.assertVersion(7);

  return {
    name: "pure-jsx-calls-plugin",
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;

        if (t.isIdentifier(callee) && (callee.name === "_jsx" || callee.name === "_jsxs")) {
          // Mark the call as PURE
          t.addComment(path.node, "leading", "#__PURE__");
        }
      },
    },
  };
});
