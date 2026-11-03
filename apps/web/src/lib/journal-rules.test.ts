import { describe, it, expect } from "vitest";
import {
  BODY_PLACES,
  PLACE_OPTIONS,
  basePlace,
  findingCounts,
  isBloodThinner,
  isPlaceId,
  isPlaceMissingSide,
  journalNotices,
  parsePlaceList,
  placeLabel,
  printRows,
  rapidWeightGainNotice,
  severityWord,
  suggestJournalDetails,
} from "@intake/core/journal";

const H = 60 * 60 * 1000;
const D = 24 * H;
const THINNERS = { onBloodThinners: true };
const NONE = { onBloodThinners: false };

const entry = (finding: string, words: string, extra: { severity?: number | null; places?: string[] } = {}) => ({
  finding,
  words,
  severity: extra.severity ?? null,
  places: extra.places ?? [],
});

const levels = (n: ReturnType<typeof journalNotices>) => n.map((x) => x.level);

describe("body places", () => {
  it("lists every sided place as left and right, every other place once", () => {
    const sided = BODY_PLACES.filter((p) => p.sided).length;
    expect(PLACE_OPTIONS).toHaveLength(BODY_PLACES.length + sided);
    expect(new Set(PLACE_OPTIONS.map((o) => o.id)).size).toBe(PLACE_OPTIONS.length);
  });

  it("labels, splits and checks place ids", () => {
    expect(placeLabel("knee-l")).toBe("Knee, left");
    expect(placeLabel("eyes")).toBe("Eyes");
    expect(placeLabel("tail")).toBe("tail");
    expect(placeLabel("knee")).toBe("Knee, which side?");
    expect(basePlace("armpit-r")).toBe("armpit");
    expect(isPlaceId("armpit-r")).toBe(true);
    expect(isPlaceId("armpit")).toBe(false);
    expect(isPlaceMissingSide("knee")).toBe(true);
    expect(isPlaceMissingSide("knee-l")).toBe(false);
    expect(isPlaceMissingSide("eyes")).toBe(false);
  });

  it("parses the parser's comma list, dropping blanks and repeats", () => {
    expect(parsePlaceList(" knee-l, eyes ,, knee-l")).toEqual(["knee-l", "eyes"]);
    expect(parsePlaceList(undefined)).toEqual([]);
  });
});

describe("severityWord", () => {
  it.each([
    [0, "none"],
    [1, "mild"],
    [3, "mild"],
    [4, "moderate"],
    [6, "moderate"],
    [7, "severe"],
    [10, "severe"],
  ] as const)("%i is %s", (n, word) => {
    expect(severityWord(n)).toBe(word);
  });
});

describe("isBloodThinner", () => {
  it.each(["Apixaban", "Eliquis (apixaban)", "clopidogrel", "Phenprocoumon", "acetylsalicylic acid"])("%s is one", (name) => {
    expect(isBloodThinner(name)).toBe(true);
  });
  it.each(["Sacubitril/Valsartan", "Bisoprolol", "Furosemide"])("%s is not", (name) => {
    expect(isBloodThinner(name)).toBe(false);
  });
});

describe("journalNotices", () => {
  it("says nothing for an ordinary entry", () => {
    expect(journalNotices(entry("Woke up late", "Today I woke up late."), THINNERS)).toEqual([]);
    expect(journalNotices(entry("Knee pain", "Pain in my left knee, a four", { severity: 4, places: ["knee-l"] }), THINNERS)).toEqual([]);
    expect(journalNotices(entry("Postnasal drip", "I have postnasal drip"), NONE)).toEqual([]);
  });

  describe("headache", () => {
    it("is urgent when sudden or worst-ever", () => {
      expect(levels(journalNotices(entry("Headache", "A sudden headache out of nowhere"), NONE))).toEqual(["urgent"]);
      expect(levels(journalNotices(entry("Headache", "Worst headache of my life"), NONE))).toEqual(["urgent"]);
    });
    it("is urgent at 9 or 10 out of 10", () => {
      expect(levels(journalNotices(entry("Headache", "Bad headache", { severity: 9 }), NONE))).toEqual(["urgent"]);
      expect(journalNotices(entry("Headache", "Bad headache", { severity: 8 }), NONE)).toEqual([]);
    });
    it("names blood thinners only when they are taken", () => {
      expect(journalNotices(entry("Headache", "sudden headache"), THINNERS)[0]!.text).toMatch(/blood thinners/);
      expect(journalNotices(entry("Headache", "sudden headache"), NONE)[0]!.text).not.toMatch(/blood thinners/);
    });
    it("is not raised for an ordinary headache", () => {
      expect(journalNotices(entry("Headache", "Today I have a headache, about a three", { severity: 3 }), THINNERS)).toEqual([]);
    });
  });

  it("chest pain or pressure is urgent", () => {
    expect(levels(journalNotices(entry("Chest pain", "Pain in my chest"), NONE))).toEqual(["urgent"]);
    expect(levels(journalNotices(entry("Chest", "Tightness", { places: ["chest"] }), NONE))).toEqual(["urgent"]);
  });

  describe("stroke signs", () => {
    it.each([
      "My left arm suddenly went weak",
      "Numb on one side of my face",
      "My speech was slurred for a minute",
      "My face was drooping in the mirror",
      "I lost my vision in one eye briefly",
    ])("%s is urgent", (words) => {
      expect(levels(journalNotices(entry("Odd episode", words), NONE))).toEqual(["urgent"]);
    });
    it.each(["Feeling weak and tired today", "My leg went numb from sitting"])("%s is not", (words) => {
      expect(journalNotices(entry("Tired", words), NONE)).toEqual([]);
    });
  });

  it("bleeding from the gut or bladder is urgent", () => {
    expect(levels(journalNotices(entry("Black stool", "Black stool this morning"), THINNERS))).toEqual(["urgent"]);
    expect(levels(journalNotices(entry("Urine", "Blood in my urine"), NONE))).toEqual(["urgent"]);
    expect(levels(journalNotices(entry("Vomiting", "I vomited blood"), NONE))).toEqual(["urgent"]);
  });

  it("a bruise is worth mentioning only on blood thinners", () => {
    expect(levels(journalNotices(entry("Bruise", "A bruise on my leg", { places: ["lowerleg-r"] }), THINNERS))).toEqual(["info"]);
    expect(journalNotices(entry("Bruise", "A bruise on my leg"), NONE)).toEqual([]);
  });

  it("ankle or leg swelling is worth a call to the heart team", () => {
    expect(levels(journalNotices(entry("Swelling", "Swollen ankles tonight"), NONE))).toEqual(["info"]);
    expect(levels(journalNotices(entry("Swelling", "Puffy", { places: ["foot-l"] }), NONE))).toEqual(["info"]);
    expect(journalNotices(entry("Swelling", "Swollen eyelid", { places: ["eyes"] }), NONE)).toEqual([]);
  });
});

describe("rapidWeightGainNotice", () => {
  const at = 10 * D;
  it("is raised for more than 2 kg within 3 days", () => {
    const n = rapidWeightGainNotice([{ timestamp: at - 2 * D, weight: 80 }, { timestamp: at - H, weight: 82.4 }], at);
    expect(n).toMatchObject({ level: "info" });
    expect(n!.text).toContain("2.4 kg");
  });
  it("is not raised for exactly 2 kg, a loss, or a gain spread over more than 3 days", () => {
    expect(rapidWeightGainNotice([{ timestamp: at - D, weight: 80 }, { timestamp: at, weight: 82 }], at)).toBeNull();
    expect(rapidWeightGainNotice([{ timestamp: at - D, weight: 83 }, { timestamp: at, weight: 80 }], at)).toBeNull();
    expect(rapidWeightGainNotice([{ timestamp: at - 4 * D, weight: 78 }, { timestamp: at, weight: 81 }], at)).toBeNull();
    expect(rapidWeightGainNotice([{ timestamp: at, weight: 81 }], at)).toBeNull();
  });
});

describe("printout", () => {
  const rows = [
    { id: "c", timestamp: 3 * D, finding: "Knee pain", deletedAt: null },
    { id: "a", timestamp: 1 * D, finding: "Nausea", deletedAt: null },
    { id: "b", timestamp: 2 * D, finding: "Knee pain", deletedAt: null },
    { id: "x", timestamp: 2 * D, finding: "Knee pain", deletedAt: 5 * D },
    { id: "old", timestamp: 0, finding: "Knee pain", deletedAt: null },
  ];

  it("keeps live entries in the period, oldest first", () => {
    expect(printRows(rows, D, 3 * D).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by title", () => {
    expect(printRows(rows, D, 3 * D, ["Knee pain"]).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("counts titles, most used first", () => {
    expect(findingCounts(rows)).toEqual([
      { finding: "Knee pain", count: 3 },
      { finding: "Nausea", count: 1 },
    ]);
  });
});

describe("suggestJournalDetails", () => {
  it.each([
    ["Pain in my left knee, about a four, worse on the stairs", { finding: "Knee pain", kind: "symptom", places: ["knee-l"], severity: 4 }],
    ["Today I woke up late", { finding: "Woke up late", kind: "event", places: [], severity: null }],
    ["I have postnasal drip", { finding: "Postnasal drip", kind: "symptom", places: ["nose", "throat"], severity: null }],
    ["Got a bruise on my right shin, no idea where from", { finding: "Bruise", kind: "sign", places: ["lowerleg-r"], severity: null }],
    ["Felt nauseous after lunch, maybe a 3/10", { finding: "Nausea", kind: "symptom", places: [], severity: 3 }],
    ["Weird sensation in my armpit", { finding: "Armpit sensation", kind: "symptom", places: [], severity: null }],
    ["Headache, 7 out of 10", { finding: "Headache", kind: "symptom", places: ["head"], severity: 7 }],
  ] as const)("%s", (text, expected) => {
    expect(suggestJournalDetails(text)).toEqual(expected);
  });

  it("does not read a clock time or a count as a rating", () => {
    expect(suggestJournalDetails("Knee hurt for a two hours").severity).toBeNull();
    expect(suggestJournalDetails("Woke at a seven am").severity).toBeNull();
    expect(suggestJournalDetails("Headache, 12 out of 10").severity).toBeNull();
  });

  it("leaves a sided place out until a side is said", () => {
    expect(suggestJournalDetails("Pain in my knee").places).toEqual([]);
  });
});
