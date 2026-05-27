// ESLint config for intake-tracker.
//
// Core rule: components and pages must not import directly from src/lib/db.ts
// or from src/lib/*-service.ts. Data access goes through src/hooks/ wrappers
// so that React Query / Dexie reactivity is preserved. The overrides below
// carve out the legitimate exceptions.

module.exports = {
  extends: "next/core-web-vitals",
  rules: {
    // ESLint hardening (P1 #9 from the May 2026 audit).
    //
    // next/core-web-vitals already includes plugin:react-hooks/recommended
    // and eslint-plugin-jsx-a11y. The defaults are mostly "warn" so the dev
    // experience stays smooth — these overrides promote the rules whose
    // false-positive rate is low and whose true positives are bugs:
    //
    //   * exhaustive-deps:       stale closures inside useEffect/useMemo
    //                            are the #1 source of "why does this UI
    //                            not refresh?" support tickets.
    //   * import/no-cycle:       cyclic imports break tree-shaking and
    //                            can cause undefined-on-load at runtime.
    //   * import/no-self-import: pure typo guard.
    //   * jsx-a11y/click-events-have-key-events,
    //     jsx-a11y/no-noninteractive-element-interactions: PWA is keyboard-
    //     accessible by design — interactive divs without key handlers
    //     ship broken to AT users. Currently 3 pre-existing violations
    //     (record-row, compound-card-expanded, dose-row); kept at "warn"
    //     so they surface in lint output without blocking the CI lint
    //     job. Promote to "error" after the dedicated a11y cleanup pass.
    //
    // Deferred (audit also recommended): @typescript-eslint/strict rules
    // and import/order. Both are high-churn warnings that need a dedicated
    // cleanup pass; landing them now would either flood `pnpm lint` or
    // require disabling most of them inline.
    "react-hooks/exhaustive-deps": "error",
    "import/no-cycle": "error",
    "import/no-self-import": "error",
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",
    "no-restricted-imports": [
      "error",
      {
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
        ],
      },
    ],
  },
  overrides: [
    // Hooks and library modules wrap the services — the rule does not apply
    // inside that layer.
    {
      files: ["src/hooks/**/*", "src/lib/**/*"],
      rules: { "no-restricted-imports": "off" },
    },
    // The debug panel surfaces raw tables and audit logs for ops; it has to
    // talk to the DB and services directly. Same for its subcomponents under
    // src/components/debug/.
    {
      files: [
        "src/components/debug-panel.tsx",
        "src/components/debug/**/*",
      ],
      rules: { "no-restricted-imports": "off" },
    },
    // Providers wire up the QueryClient and other singletons that initialise
    // before any hook can run.
    {
      files: ["src/app/providers.tsx"],
      rules: { "no-restricted-imports": "off" },
    },
    {
      files: ["src/__tests__/**/*"],
      rules: { "no-restricted-imports": "off" },
    },
    // Analytics tabs and the export-controls dialog run one-off queries and
    // batch exports that do not fit the React Query hook model (e.g. building
    // a PDF over all prescriptions). They are deliberately allowed to call
    // services directly.
    {
      files: [
        "src/components/analytics/titration-tab.tsx",
        "src/components/analytics/records-tab.tsx",
        "src/components/analytics/export-controls.tsx",
      ],
      rules: { "no-restricted-imports": "off" },
    },
  ],
};
