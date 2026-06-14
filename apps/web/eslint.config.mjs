// ESLint flat config (ESLint 10) for @intake/web.
//
// Spreads the shared lean base (@intake/eslint-config = js.recommended +
// typescript-eslint + prettier + no-unused-vars + consistent-type-imports) and
// layers on the app-specific rules: the Next.js plugin, intake's import-boundary
// bans + folder overrides, the promoted quality gates, and the deferred
// strict-rule downgrades (see DEFERRED.md).
//
// We register the official Next/React/import/a11y plugins DIRECTLY rather than
// `eslint-config-next`'s `core-web-vitals` bundle, which pulls in
// `eslint-plugin-react@7.37` — incompatible with ESLint 10 (removed
// `context.getFilename()`). A TypeScript app doesn't need eslint-plugin-react.

import base from "@intake/eslint-config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";

// All intra-`src` imports must use the `@/...` path alias rather than `./`
// or `../` relative paths (tsconfig maps `@/*` -> `./src/*`).
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
  ...base,
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
      import: importPlugin,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      "import/resolver": { typescript: true, node: true },
    },
    rules: {
      // Next.js rules (from @next/eslint-plugin-next, ESLint-10 native).
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Deferred strict rules — ride at warn pending a cleanup pass (DEFERRED.md).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "no-regex-spaces": "error",
      "no-empty": "error",
      // Promoted to error (May 2026 audit).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      // Pre-existing a11y debt — warn so it surfaces without blocking CI.
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
  // Analytics tabs + export dialog run one-off queries / batch exports.
  {
    files: [
      "src/components/analytics/titration-tab.tsx",
      "src/components/analytics/records-tab.tsx",
      "src/components/analytics/export-controls.tsx",
    ],
    ...RELATIVE_ONLY,
  },
  { ignores: ["**/.next/**", "**/out/**", "**/dist/**"] },
];
