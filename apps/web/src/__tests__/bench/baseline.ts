import { existsSync } from "node:fs";
import path from "node:path";
import type { BenchFn, TestContext } from "vitest";

type Bench = TestContext["bench"];

/** tinybench run options shared by every benchmark in this directory. */
const RUN_OPTIONS = { time: 2000, iterations: 5, warmupIterations: 1 };

/**
 * Run `fn` as a benchmark and, when a stored baseline exists, print it next to
 * the fresh result (Vitest 5 replacement for `vitest bench --compare`).
 *
 * `BENCH_WRITE_BASELINE=1` (see the `bench:ci` script) overwrites the baseline
 * at `benchmarks/<slug>.json` with this run's result instead.
 */
export async function benchAgainstBaseline(
  bench: Bench,
  slug: string,
  name: string,
  fn: BenchFn,
): Promise<void> {
  const baselinePath = `benchmarks/${slug}.json`;

  if (process.env.BENCH_WRITE_BASELINE === "1") {
    await bench(name, { writeResult: baselinePath }, fn).run(RUN_OPTIONS);
    return;
  }

  if (!existsSync(path.resolve(process.cwd(), baselinePath))) {
    await bench(name, fn).run(RUN_OPTIONS);
    return;
  }

  await bench.compare(
    bench.from("baseline", baselinePath),
    bench(name, fn),
    RUN_OPTIONS,
  );
}
