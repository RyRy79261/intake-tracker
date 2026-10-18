/**
 * One day of records shared by the app parity test
 * (`daily-totals-parity.dom.test.tsx`) and the MCP parity test (the
 * integration suite), so both check the same numbers: 700 ml water and
 * 1600 mg sodium today. Times are local wall-clock times, so the tests run
 * in the host zone (the app's zone).
 */
const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime(); // Thu 24 Sep 2026

export const PARITY_DAY = {
  /** 18:00 on Thursday. */
  now: new Date(2026, 8, 24, 18, 0),
  dayStartHour: 2,
  rows: [
    // Yesterday's logical day: 01:30 is before the 02:00 day start.
    { type: "water" as const, amount: 900, timestamp: at(1, 30) },
    // Today.
    { type: "water" as const, amount: 400, timestamp: at(9) },
    { type: "water" as const, amount: 300, timestamp: at(17, 59) },
    { type: "salt" as const, amount: 1600, timestamp: at(12) },
    // Later today: dated in the future, so it does not count yet.
    { type: "water" as const, amount: 500, timestamp: at(20) },
    { type: "salt" as const, amount: 800, timestamp: at(21) },
  ],
  expected: { water: 700, sodium: 1600 },
};
