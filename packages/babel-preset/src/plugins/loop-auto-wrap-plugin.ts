import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";

type Metadata = {
  importedLoops: Set<string>;
  localLoops: Set<string>;
};

/**
 * babel plugin to auto wrap loops
 *
 * @param api - The babel api.
 * @returns The babel options.
 */
export const loopAutoWrapPlugin = declare((api) => {
  api.assertVersion(7);
  return {
    name: "loop-auto-wrap-plugin",
    pre() {
      // Initialize metadata storage per file
      const meta = this.file.metadata as Partial<Metadata>;
      meta.importedLoops = new Set();
      meta.localLoops = new Set();
    },
    visitor: {
      Program(path, state) {
        const meta = state.file.metadata as Metadata;
        const importedLoops = meta.importedLoops;
        const localLoops = meta.localLoops;

        path.get("body").forEach((child) => {
          if (child.isImportDeclaration() && child.node.source.value === "vynn") {
            child.node.specifiers.forEach((spec) => {
              if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported, { name: "loop" })) {
                importedLoops.add(spec.local.name);
              }
            });
          }

          if (child.isFunctionDeclaration() && t.isIdentifier(child.node.id)) {
            localLoops.add(child.node.id.name);
          }

          if (child.isVariableDeclaration()) {
            child.node.declarations.forEach((decl) => {
              if (t.isIdentifier(decl.id)) {
                localLoops.add(decl.id.name);
              }
            });
          }
        });
      },

      CallExpression(path, state) {
        const meta = state.file.metadata as Metadata;
        const importedLoops = meta.importedLoops;
        const localLoops = meta.localLoops;

        const callee = path.get("callee");
        if (!callee.isIdentifier()) return;

        const name = callee.node.name;

        if (importedLoops.has(name) && !localLoops.has(name)) {
          if (path.node.arguments.length === 1) {
            const arg = path.node.arguments[0];
            if (!t.isArrowFunctionExpression(arg) && t.isExpression(arg)) {
              path.node.arguments[0] = t.arrowFunctionExpression([], arg);
            }
          }
        }
      },
    },
  };
});
