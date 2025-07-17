import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";

type Metadata = {
  importedResources: Set<string>;
  localResources: Set<string>;
};

/**
 * Babel plugin to auto-wrap resource dependency entries into arrow fns
 *
 * @example
 * resource(fn, [pokeDex.url]) → resource(fn, [() => pokeDex.url])
 */
export const wrapResourceDepsPlugin = declare((api) => {
  api.assertVersion(7);
  return {
    name: "wrap-resource-deps-plugin",
    pre() {
      const meta = this.file.metadata as Partial<Metadata>;
      meta.importedResources = new Set();
      meta.localResources = new Set();
    },
    visitor: {
      Program(path, state) {
        const meta = state.file.metadata as Metadata;
        const importedResources = meta.importedResources;
        const localResources = meta.localResources;

        path.get("body").forEach((child) => {
          // Track imports of `resource` from "vynn"
          if (child.isImportDeclaration() && child.node.source.value === "vynn") {
            child.node.specifiers.forEach((spec) => {
              if (
                t.isImportSpecifier(spec) &&
                t.isIdentifier(spec.imported, { name: "resource" })
              ) {
                importedResources.add(spec.local.name);
              }
            });
          }

          // Track local shadowing declarations
          if (child.isFunctionDeclaration() && t.isIdentifier(child.node.id)) {
            localResources.add(child.node.id.name);
          }

          if (child.isVariableDeclaration()) {
            child.node.declarations.forEach((decl) => {
              if (t.isIdentifier(decl.id)) {
                localResources.add(decl.id.name);
              }
            });
          }
        });
      },

      CallExpression(path, state) {
        const meta = state.file.metadata as Metadata;
        const importedResources = meta.importedResources;
        const localResources = meta.localResources;

        const callee = path.get("callee");
        if (!callee.isIdentifier()) return;

        const name = callee.node.name;
        if (!importedResources.has(name) || localResources.has(name)) return;

        // Look at the 2nd argument
        const args = path.node.arguments;
        if (args.length < 2) return;

        const secondArg = args[1];
        if (!t.isArrayExpression(secondArg)) return;

        // Rewrite each dependency entry
        secondArg.elements = secondArg.elements.map((el) => {
          if (!el) return el;

          // If already () => …, skip
          if (t.isArrowFunctionExpression(el)) return el;

          if (t.isExpression(el)) {
            return t.arrowFunctionExpression([], el);
          }
          return el;
        });
      },
    },
  };
});
