// Empty stub for the `server-only` / `client-only` bundler-marker packages.
//
// These are React-team packages (shipped by Next.js) whose only job is to make
// `next build` refuse to include a module in the wrong bundle, via the
// `react-server` export condition. They have no resolver under vitest's node
// environment, so the test configs (vitest.config.ts + vitest.integration.config.ts)
// alias both specifiers here. The boundary they enforce is validated by
// `next build` and `bundle-security.test.ts`, not by unit tests.
export {};
