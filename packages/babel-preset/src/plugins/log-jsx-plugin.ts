import path from "node:path";
import { fileURLToPath } from "node:url";

import { NodePath } from "@babel/core";
import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Babel plugin to cleanly log <jsx>
 *
 * @param api - The babel api.
 * @returns The babel options.
 */
export const logJsxPlugin = declare((api) => {
  api.assertVersion(7);

  return {
    name: "log-jsx-plugin",
    visitor: {
      Program(babelPath, state) {
        // Skip vynn/core internal
        if (state.filename?.includes(path.resolve(__dirname, "../../../vynn"))) {
          return;
        }

        let hasLogJsx = false;

        // Check existing imports
        babelPath.get("body").forEach((child) => {
          if (child.isImportDeclaration() && child.node.source.value === "vynn/jsx-runtime") {
            child.node.specifiers.forEach((spec) => {
              if (t.isImportSpecifier(spec)) {
                const imported = spec.imported;
                if (t.isIdentifier(imported) && imported.name === "logJsx") {
                  hasLogJsx = true;
                }
              }
            });
          }
        });

        // Insert import if missing
        if (!hasLogJsx) {
          const importDecl = t.importDeclaration(
            [t.importSpecifier(t.identifier("logJsx"), t.identifier("logJsx"))],
            t.stringLiteral("vynn/jsx-runtime"),
          );
          babelPath.unshiftContainer("body", importDecl);
        }
      },

      CallExpression(babelPath: NodePath<t.CallExpression>) {
        const callee = babelPath.get("callee");

        // Detect console.* calls
        if (
          t.isMemberExpression(callee.node) &&
          t.isIdentifier(callee.node.object, { name: "console" }) &&
          t.isIdentifier(callee.node.property)
        ) {
          // For each argument, check if JSX
          const newArgs = babelPath.node.arguments.map((arg) => {
            if (t.isJSXElement(arg) || t.isJSXFragment(arg)) {
              return t.callExpression(t.identifier("logJsx"), [arg]);
            }
            return arg;
          });

          // Replace arguments if any JSX was wrapped
          if (newArgs.some((arg, i) => arg !== babelPath.node.arguments[i])) {
            babelPath.node.arguments = newArgs;
          }
        }
      },
    },
  };
});
