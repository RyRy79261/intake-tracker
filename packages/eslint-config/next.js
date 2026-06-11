import base from "./index.js";

/**
 * Next.js variant placeholder (kept for parity with the sibling monorepos).
 * intake-tracker wires the Next.js plugin + its app-specific rules directly in
 * `apps/web/eslint.config.mjs` because `eslint-config-next`'s `core-web-vitals`
 * bundle pulls in `eslint-plugin-react@7.37`, which crashes under ESLint 10.
 */
export default [
  ...base,
  {
    rules: {},
  },
];
