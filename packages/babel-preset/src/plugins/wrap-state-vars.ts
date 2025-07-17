import { declare } from "@babel/helper-plugin-utils";
import * as t from "@babel/types";
import fs from "fs";
import path from "path";

export const wrapStatePlugin = declare((api) => {
  api.assertVersion(7);

  const VYNN_TYPES_DIR = path.resolve(process.cwd(), ".vynn");
  const VYNN_TYPES_FILE = path.join(VYNN_TYPES_DIR, "auto-state-types.d.ts");

  const declaredStates = new Map<string, string>();

  return {
    name: "vynn-state-plugin",

    pre() {
      if (fs.existsSync(VYNN_TYPES_FILE)) fs.unlinkSync(VYNN_TYPES_FILE);
    },

    visitor: {
      // Detect state() declarations
      VariableDeclarator(path) {
        const { node } = path;

        if (
          t.isCallExpression(node.init) &&
          t.isIdentifier(node.init.callee) &&
          node.init.callee.name === "state" &&
          t.isIdentifier(node.id)
        ) {
          const varName = node.id.name;
          let inferredType = "any";

          if (node.init.arguments.length > 0) {
            const arg = node.init.arguments[0];

            // Infer basic types
            if (t.isNumericLiteral(arg)) inferredType = "number";
            else if (t.isStringLiteral(arg)) inferredType = "string";
            else if (t.isBooleanLiteral(arg)) inferredType = "boolean";
            else if (t.isArrayExpression(arg)) {
              const types = new Set<string>();
              arg.elements.forEach((el) => {
                if (t.isNumericLiteral(el)) types.add("number");
                else if (t.isStringLiteral(el)) types.add("string");
                else if (t.isBooleanLiteral(el)) types.add("boolean");
                else types.add("any");
              });
              inferredType = `${[...types].join(" | ")}[]`;
            } else if (t.isObjectExpression(arg)) {
              const props: string[] = [];
              arg.properties.forEach((p) => {
                if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
                  let valType = "any";
                  if (t.isNumericLiteral(p.value)) valType = "number";
                  else if (t.isStringLiteral(p.value)) valType = "string";
                  else if (t.isBooleanLiteral(p.value)) valType = "boolean";
                  else if (t.isArrayExpression(p.value)) valType = "any[]";
                  else if (t.isObjectExpression(p.value)) valType = "object";
                  props.push(`${p.key.name}: ${valType}`);
                }
              });
              inferredType = `{ ${props.join("; ")} }`;
            }
          }

          declaredStates.set(varName, inferredType);
        }
      },

      // Transform $x → x.value everywhere
      Identifier(path) {
        const { node, parent } = path;
        if (!node.name.startsWith("$")) return;

        const rawName = node.name.slice(1);
        if (!declaredStates.has(rawName)) return;

        // Assignment: $x = …
        if (t.isAssignmentExpression(parent) && parent.left === node) {
          path.replaceWith(t.memberExpression(t.identifier(rawName), t.identifier("value")));
          return;
        }

        // Update: $x++ / --$x
        if (t.isUpdateExpression(parent) && parent.argument === node) {
          path.replaceWith(t.memberExpression(t.identifier(rawName), t.identifier("value")));
          return;
        }

        // Skip object keys or member properties
        if (
          t.isObjectProperty(parent, { key: node }) ||
          (t.isMemberExpression(parent) && parent.property === node && !parent.computed)
        ) {
          return;
        }

        // Read: $x → x.value
        path.replaceWith(t.memberExpression(t.identifier(rawName), t.identifier("value")));
      },

      Program: {
        exit() {
          if (declaredStates.size === 0) return;

          if (!fs.existsSync(VYNN_TYPES_DIR)) fs.mkdirSync(VYNN_TYPES_DIR);

          const lines = Array.from(declaredStates.entries()).map(
            ([name, type]) => `type $${name} = ${type};`,
          );

          const content = lines.join("\n") + "\n";
          fs.writeFileSync(VYNN_TYPES_FILE, content);
        },
      },
    },
  };
});
