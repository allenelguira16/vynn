import { declare } from "@babel/helper-plugin-utils";
import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export const wrapJsxExpressionsPlugin = declare((api) => {
  api.assertVersion(7);

  return {
    name: "wrap-jsx-expression-plugin",
    visitor: {
      JSXOpeningElement(path) {
        const attributes = path.node.attributes;

        const newAttributes = attributes.map((attr) => {
          if (!t.isJSXAttribute(attr) || !attr.value) return attr;

          const attrName = t.isJSXIdentifier(attr.name) ? attr.name.name : null;

          // Special handling for ref={myRef}
          if (
            attrName === "ref" &&
            t.isJSXExpressionContainer(attr.value) &&
            t.isIdentifier(attr.value.expression)
          ) {
            const myRef = attr.value.expression;
            const elemParam = t.identifier("elem");
            const assignment = t.assignmentExpression("=", myRef, elemParam);

            const wrappedRef = t.addComment(
              t.arrowFunctionExpression([elemParam], assignment),
              "leading",
              "#__PURE__",
            );

            return t.jsxAttribute(t.jsxIdentifier(attrName), t.jsxExpressionContainer(wrappedRef));
          }

          let propValue: t.Expression | null = null;

          if (t.isStringLiteral(attr.value)) {
            propValue = attr.value;
          } else if (t.isJSXExpressionContainer(attr.value)) {
            if (!t.isJSXEmptyExpression(attr.value.expression)) {
              propValue = attr.value.expression;
            }
          }

          if (propValue === null || attrName === null) return attr;

          const wrappedFn = t.addComment(
            t.arrowFunctionExpression([], propValue),
            "leading",
            "#__PURE__",
          );

          return t.jsxAttribute(t.jsxIdentifier(attrName), t.jsxExpressionContainer(wrappedFn));
        });

        path.node.attributes = newAttributes;
      },

      JSXExpressionContainer(path: NodePath<t.JSXExpressionContainer>) {
        const expr = path.node.expression;

        // Skip if it's empty, function, arrow, or literal
        if (
          t.isJSXEmptyExpression(expr) ||
          t.isFunction(expr) ||
          t.isArrowFunctionExpression(expr) ||
          t.isLiteral(expr)
        ) {
          return;
        }

        // Wrap expression in a pure arrow function
        const wrapped = t.addComment(t.arrowFunctionExpression([], expr), "leading", "#__PURE__");

        path.replaceWith(t.jsxExpressionContainer(wrapped));
      },
    },
  };
});
