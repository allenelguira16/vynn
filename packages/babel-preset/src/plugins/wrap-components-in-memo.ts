import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";

export const wrapComponentsInMemo = declare((api) => {
  api.assertVersion(7);

  return {
    name: "wrap-components-in-memo",
    visitor: {
      Program(path) {
        let hasMemo = false;

        // check for existing `memo` import
        path.get("body").forEach((child) => {
          if (child.isImportDeclaration() && child.node.source.value === "vynn") {
            child.node.specifiers.forEach((spec) => {
              if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported, { name: "memo" })) {
                hasMemo = true;
              }
            });
          }
        });

        // insert if missing
        if (!hasMemo) {
          const importDecl = t.importDeclaration(
            [t.importSpecifier(t.identifier("memo"), t.identifier("memo"))],
            t.stringLiteral("vynn"),
          );
          path.unshiftContainer("body", importDecl);
        }
      },

      // Transform function declarations
      FunctionDeclaration(path) {
        const { node } = path;

        // only handle top-level components (name starts with capital letter)
        if (!node.id || !/^[A-Z]/.test(node.id.name)) return;

        const name = node.id.name;

        // create const assignment: const Name = memo(() => { ... })
        const memoized = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier(name),
            t.callExpression(t.identifier("memo"), [
              t.arrowFunctionExpression(node.params, node.body, node.async),
            ]),
          ),
        ]);

        path.replaceWith(memoized);
      },

      // Transform const Component = () => {}
      VariableDeclarator(path) {
        const { node } = path;

        if (!t.isIdentifier(node.id) || !/^[A-Z]/.test(node.id.name)) return;
        if (!t.isArrowFunctionExpression(node.init) && !t.isFunctionExpression(node.init)) return;

        node.init = t.callExpression(t.identifier("memo"), [node.init]);
      },
    },
  };
});
