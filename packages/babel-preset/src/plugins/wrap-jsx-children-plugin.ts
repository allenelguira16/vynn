import { declare } from "@babel/helper-plugin-utils";
import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export const wrapJsxChildrenPlugin = declare((api) => {
  api.assertVersion(7);

  function wrapChildren(path: NodePath<t.JSXElement | t.JSXFragment>) {
    const processedChildren: t.Expression[] = [];

    path.node.children.forEach((child, i) => {
      if (t.isJSXText(child)) {
        let value = child.value;

        if (!value.includes("\n") || value.trim() !== "") {
          if (i === 0) value = value.trimStart();
          if (i === path.node.children.length - 1) value = value.trimEnd();

          // wrap text child in a pure arrow function
          processedChildren.push(
            t.addComment(
              t.arrowFunctionExpression([], t.stringLiteral(value)),
              "leading",
              "#__PURE__",
            ),
          );
        }
      } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
        // wrap JSX element/fragment in a pure arrow function
        processedChildren.push(
          t.addComment(t.arrowFunctionExpression([], child), "leading", "#__PURE__"),
        );
      } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
        const expr = child.expression;

        if (t.isStringLiteral(expr)) {
          processedChildren.push(expr);
        } else {
          // wrap expression in a pure arrow function
          processedChildren.push(
            t.addComment(t.arrowFunctionExpression([], expr), "leading", "#__PURE__"),
          );
        }
      }
    });

    if (processedChildren.length === 0) return;

    let body =
      processedChildren.length === 1 ? processedChildren[0] : t.arrayExpression(processedChildren);

    if (!t.isArrowFunctionExpression(body)) {
      body = t.addComment(t.arrowFunctionExpression([], body), "leading", "#__PURE__");
    }

    path.node.children = [t.jsxExpressionContainer(body)];
  }

  return {
    name: "wrap-jsx-children-plugin",
    visitor: {
      JSXElement(path) {
        wrapChildren(path);
      },
      JSXFragment(path) {
        wrapChildren(path);
      },
      ReturnStatement(path) {
        const arg = path.node.argument;
        if (!arg) return;

        if (t.isJSXElement(arg) || t.isJSXFragment(arg)) {
          // wrap return JSX in arrow fn
          path.node.argument = t.addComment(
            t.arrowFunctionExpression([], arg),
            "leading",
            "#__PURE__",
          );
        }
      },
    },
  };
});
