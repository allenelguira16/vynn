import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";

function containsJSX(node: t.Node | null | undefined): boolean {
  if (!node) return false;
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true;
  if (t.isConditionalExpression(node)) {
    return containsJSX(node.consequent) || containsJSX(node.alternate);
  }
  if (t.isLogicalExpression(node)) {
    return containsJSX(node.left) || containsJSX(node.right);
  }
  if (t.isArrayExpression(node)) {
    return node.elements.some((el) =>
      el && !t.isSpreadElement(el) ? containsJSX(el as t.Node) : false,
    );
  }
  return false;
}

export const wrapJsxVariables = declare((api) => {
  api.assertVersion(7);

  return {
    name: "wrap-jsx-variables",
    visitor: {
      VariableDeclarator(path) {
        const init = path.node.init;
        if (!init) return;

        if (containsJSX(init) && !t.isArrowFunctionExpression(init)) {
          path.node.init = t.arrowFunctionExpression([], init);
        }
      },
      AssignmentExpression(path) {
        const right = path.node.right;
        if (containsJSX(right) && !t.isArrowFunctionExpression(right)) {
          path.node.right = t.arrowFunctionExpression([], right);
        }
      },
    },
  };
});
