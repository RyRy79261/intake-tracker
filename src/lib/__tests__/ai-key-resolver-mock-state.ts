// Shared state for the ai-key-resolver mock. Lives outside the test file so
// the hoisted vi.mock factory can import it without a top-level reference
// error. Test-only helper.
export const mockState: {
  rowsByCall: Array<Record<string, unknown>[]>;
  idx: number;
} = {
  rowsByCall: [],
  idx: 0,
};
