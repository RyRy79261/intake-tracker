import tseslint from "typescript-eslint";

// Standalone, purity-only ESLint config for @intake/core.
//
// It deliberately does NOT spread @intake/eslint-config: that shared base runs
// the deferred-strict ruleset (no-explicit-any, etc.) at `error`, which would
// fail this package (and every future move into it). We only need the TS parser
// (to read the .ts AST) plus one rule that keeps the package pure.
//
// The DOM-free tsconfig already makes browser/node globals (window, document,
// localStorage, btoa, atob, navigator, process, fetch types) compile errors.
// This rule closes the remaining gap — the wall-clock / non-deterministic
// globals that still live in the ES2022 lib. Core takes an injected `now` / tz
// instead of reading them. `new Date(arg)` stays allowed (pure given its arg);
// only the bare zero-arg `new Date()` is banned.
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "@intake/core must stay pure: take an injected `now` instead of calling Date.now().",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "@intake/core must stay pure: take an injected `now` instead of `new Date()` (new Date(arg) is allowed).",
        },
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            "@intake/core must stay pure: take injected randomness instead of Math.random().",
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "@intake/core must stay pure: no I/O — perform fetch() in the app layer.",
        },
      ],
    },
  },
];
