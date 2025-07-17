import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", ".yarn/**", ".vscode/**", ".pnp*"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",

      // Auto-sort imports
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",

      // Unused import cleanup
      "unused-imports/no-unused-imports": "warn",

      // ✅ Use @typescript-eslint's rule for unused vars instead
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ⛔ Disable unused-imports version of this rule
      "unused-imports/no-unused-vars": "off",

      "@typescript-eslint/no-namespace": "off",

      // // Console statements
      // "no-console": ["warn", { allow: ["warn", "error"] }],

      // Best practices
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
];
