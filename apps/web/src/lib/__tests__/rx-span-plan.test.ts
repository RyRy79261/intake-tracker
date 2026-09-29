import { describe, it, expect } from "vitest";
import { rxSpanPlan } from "@/lib/rx-span-plan";

const ids = ["a", "b", "c", "d", "e"];

describe("rxSpanPlan", () => {
  it("spans nothing when no card is expanded", () => {
    expect(rxSpanPlan(ids, null)).toEqual([false, false, false, false, false]);
  });

  it("spans only the expanded card when it starts a row", () => {
    // a | b, then c (left column) takes the whole row, d | e follow.
    expect(rxSpanPlan(ids, "c")).toEqual([false, false, true, false, false]);
    expect(rxSpanPlan(ids, "a")).toEqual([true, false, false, false, false]);
  });

  it("spans the left neighbour an expanded right-column card leaves alone", () => {
    // b would sit right of a: a is left alone on its row, so it spans too.
    expect(rxSpanPlan(ids, "b")).toEqual([true, true, false, false, false]);
    // d would sit right of c.
    expect(rxSpanPlan(ids, "d")).toEqual([false, false, true, true, false]);
  });

  it("re-pairs the cards after the expanded one from the left column", () => {
    // a expanded: b | c pair up, d | e pair up.
    expect(rxSpanPlan(ids, "a").slice(1)).toEqual([false, false, false, false]);
    // e expanded, last and in the left column: only e spans.
    expect(rxSpanPlan(ids, "e")).toEqual([false, false, false, false, true]);
  });

  it("leaves an odd last card at one column", () => {
    expect(rxSpanPlan(["a", "b", "c"], null)).toEqual([false, false, false]);
    expect(rxSpanPlan(["a", "b", "c"], "b")).toEqual([true, true, false]);
  });

  it("ignores an expanded id that is not in the list", () => {
    expect(rxSpanPlan(["a", "b"], "zz")).toEqual([false, false]);
    expect(rxSpanPlan([], "a")).toEqual([]);
  });
});
