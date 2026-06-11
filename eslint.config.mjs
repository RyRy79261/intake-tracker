// ESLint flat config (ESLint 10) for intake-tracker.
//
// Migrated from the legacy .eslintrc.js (ESLint 8). Structure mirrors the
// sibling monorepos' shared eslint-config (js.recommended + typescript-eslint +
// prettier) but ADDS the Next.js rules + intake-tracker's own load-bearing
// rules, which the refs dropped:
//
//   * The import-boundary bans: components/pages must not import `db` or
//     `*-service` modules directly (data access goes through src/hooks/), and
//     all intra-`src` imports must use the `@/...` alias, not relative paths.
//   * Promoted-to-error quality gates (May 2026 audit): react-hooks/
//     exhaustive-deps, import/no-cycle, import/no-self-import.
//
// NOTE on plugin composition: we register the official plugins
// (@next/eslint-plugin-next, eslint-plugin-react-hooks, eslint-plugin-import,
// eslint-plugin-jsx-a11y) DIRECTLY rather than spreading `eslint-config-next`'s
// `core-web-vitals`, because that bundle pulls in `eslint-plugin-react@7.37`,
// which uses the removed `context.getFilename()` API and crashes under ESLint
// 10. A TypeScript app doesn't need eslint-plugin-react's prop-types/display-name
// rules, so we simply omit it.
//
// When packages/eslint-config is extracted (Turborepo migration Phase 1), the
// lean base (js + tseslint + prettier) moves to that package and the Next +
// intake-specific blocks stay in apps/web/eslint.config.mjs — matching the refs.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";

// All intra-`src` imports must use the `@/...` path alias rather than `./`
// or `../` relative paths (tsconfig maps `@/*` -> `./src/*`). Reused inside the
// folder overrides below (which otherwise turn `no-restricted-imports` off and
// would lose the rule).
const NO_RELATIVE_IMPORTS = {
  group: ["./*", "../*"],
  message:
    "Use the '@/...' alias instead of relative imports (tsconfig maps @/* to ./src/*).",
};

const RESTRICTED_IMPORTS = {
  patterns: [
    {
      group: ["@/lib/db"],
      importNames: ["db"],
      message:
        "Components must not import 'db' directly. Use hooks instead. Type imports are allowed.",
    },
    {
      group: ["@/lib/*-service", "@/lib/*-service.ts"],
      message:
        "Components/pages must not import services directly. Use hooks in src/hooks/ instead.",
    },
    NO_RELATIVE_IMPORTS,
  ],
};

// Folders that legitimately bypass the db/service-access ban (the relative-import
// ban still applies to them).
const RELATIVE_ONLY = {
  rules: {
    "no-restricted-imports": ["error", { patterns: [NO_RELATIVE_IMPORTS] }],
  },
};

export default [
  {
    ignores: [
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.stryker-tmp/**",
      "drizzle/**",
      "android/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
      import: importPlugin,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // Next.js rules (from @next/eslint-plugin-next, ESLint-10 native).
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Deferred strict rules. js.recommended + tseslint.recommended newly
      // surface these (91 violations) that the old Next-only config never
      // enforced. The May 2026 audit deliberately deferred the strict ruleset
      // to "a dedicated cleanup pass" — so they ride at "warn" (visible, not
      // blocking) and should be ratcheted to "error" once cleaned up. See
      // DEFERRED.md.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "no-regex-spaces": "warn",
      "no-empty": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      // React Hooks — exhaustive-deps promoted to error (May 2026 audit).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Import hygiene — promoted to error (May 2026 audit).
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      // Pre-existing a11y debt — kept at warn so it surfaces without blocking CI.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "no-restricted-imports": ["error", RESTRICTED_IMPORTS],
    },
  },
  // Hooks + library modules wrap the services — db/service ban does not apply.
  { files: ["src/hooks/**/*", "src/lib/**/*"], ...RELATIVE_ONLY },
  // Debug panel surfaces raw tables/audit logs for ops; needs direct DB access.
  {
    files: ["src/components/debug-panel.tsx", "src/components/debug/**/*"],
    ...RELATIVE_ONLY,
  },
  // Providers wire up the QueryClient + singletons before any hook can run.
  { files: ["src/app/providers.tsx"], ...RELATIVE_ONLY },
  { files: ["src/__tests__/**/*"], ...RELATIVE_ONLY },
  // Analytics tabs + export dialog run one-off queries / batch exports that do
  // not fit the React Query hook model.
  {
    files: [
      "src/components/analytics/titration-tab.tsx",
      "src/components/analytics/records-tab.tsx",
      "src/components/analytics/export-controls.tsx",
    ],
    ...RELATIVE_ONLY,
  },
];
