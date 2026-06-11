import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Shared base ESLint flat config for @intake/* packages and apps.
 *
 * Lean by design (js.recommended + typescript-eslint + prettier), matching the
 * sibling monorepos. App-specific layers — the Next.js plugin rules, the
 * import-boundary bans, and intake's deferred strict-rule downgrades — live in
 * `apps/web/eslint.config.mjs`, which spreads this base.
 */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
  {
    ignores: [
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.stryker-tmp/**",
    ],
  },
];
