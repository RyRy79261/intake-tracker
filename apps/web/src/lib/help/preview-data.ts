import { baseSyncFields, generateId, syncFields } from "@/lib/utils";
import { toLocalDateKey } from "@/lib/date-utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "@/lib/timezone";
import type {
  AppDatabase,
  BloodPressureRecord,
  DefecationRecord,
  DoseLog,
  IntakeRecord,
  InventoryItem,
  InventoryTransaction,
  MedicationPhase,
  PhaseSchedule,
  Prescription,
  SubstanceRecord,
  UrinationRecord,
  WeightRecord,
} from "@/lib/db";

/**
 * Sample data for the in-app component previews. Each function bulk-inserts
 * curated rows into a throwaway preview database (created by
 * `createPreviewDatabase`) so the previewed component has something realistic
 * to show. This data never touches the user's real database.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export async function seedBloodPressurePreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: BloodPressureRecord[] = [
    {
      id: generateId(),
      systolic: 118,
      diastolic: 76,
      heartRate: 68,
      position: "sitting",
      arm: "left",
      timestamp: now - DAY_MS,
      ...syncFields(),
    },
    {
      id: generateId(),
      systolic: 124,
      diastolic: 81,
      heartRate: 72,
      position: "sitting",
      arm: "left",
      timestamp: now - 3 * DAY_MS,
      ...syncFields(),
    },
    {
      id: generateId(),
      systolic: 131,
      diastolic: 84,
      heartRate: 77,
      position: "standing",
      arm: "right",
      timestamp: now - 6 * DAY_MS,
      ...syncFields(),
    },
  ];
  await database.bloodPressureRecords.bulkAdd(rows);
}

export async function seedWeightPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: WeightRecord[] = [
    { id: generateId(), weight: 74.6, timestamp: now - DAY_MS, ...syncFields() },
    {
      id: generateId(),
      weight: 74.9,
      timestamp: now - 4 * DAY_MS,
      ...syncFields(),
    },
    {
      id: generateId(),
      weight: 75.4,
      timestamp: now - 8 * DAY_MS,
      ...syncFields(),
    },
  ];
  await database.weightRecords.bulkAdd(rows);
}

export async function seedLiquidsPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: IntakeRecord[] = [
    {
      id: generateId(),
      type: "water",
      amount: 250,
      timestamp: now - HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "water",
      amount: 200,
      timestamp: now - 3 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "water",
      amount: 300,
      timestamp: now - 6 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
  ];
  await database.intakeRecords.bulkAdd(rows);
}

export async function seedFoodSaltPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const rows: IntakeRecord[] = [
    {
      id: generateId(),
      type: "salt",
      amount: 400,
      timestamp: now - 2 * HOUR_MS,
      source: "manual",
      note: "Lunch",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "salt",
      amount: 250,
      timestamp: now - 5 * HOUR_MS,
      source: "manual",
      note: "Breakfast",
      ...syncFields(),
    },
  ];
  await database.intakeRecords.bulkAdd(rows);
}

export async function seedBathroomPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const urination: UrinationRecord[] = [
    {
      id: generateId(),
      timestamp: now - HOUR_MS,
      amountEstimate: "medium",
      ...syncFields(),
    },
    {
      id: generateId(),
      timestamp: now - 4 * HOUR_MS,
      amountEstimate: "large",
      ...syncFields(),
    },
    {
      id: generateId(),
      timestamp: now - 8 * HOUR_MS,
      amountEstimate: "small",
      note: "pale",
      ...syncFields(),
    },
  ];
  const defecation: DefecationRecord[] = [
    {
      id: generateId(),
      timestamp: now - 5 * HOUR_MS,
      amountEstimate: "medium",
      note: "normal",
      ...syncFields(),
    },
    {
      id: generateId(),
      timestamp: now - DAY_MS - 4 * HOUR_MS,
      amountEstimate: "small",
      ...syncFields(),
    },
  ];
  await database.urinationRecords.bulkAdd(urination);
  await database.defecationRecords.bulkAdd(defecation);
}

export async function seedTextMetricsPreview(
  database: AppDatabase,
): Promise<void> {
  const now = Date.now();
  const intake: IntakeRecord[] = [
    {
      id: generateId(),
      type: "water",
      amount: 500,
      timestamp: now - HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "water",
      amount: 300,
      timestamp: now - 4 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
    {
      id: generateId(),
      type: "salt",
      amount: 600,
      timestamp: now - 2 * HOUR_MS,
      source: "manual",
      ...syncFields(),
    },
  ];
  const substances: SubstanceRecord[] = [
    {
      id: generateId(),
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Coffee",
      source: "standalone",
      aiEnriched: false,
      timestamp: now - 3 * HOUR_MS,
      ...syncFields(),
    },
  ];
  await database.intakeRecords.bulkAdd(intake);
  await database.substanceRecords.bulkAdd(substances);
}

// ---------------------------------------------------------------------------
// Today gadget, Records and Medications previews
// ---------------------------------------------------------------------------

/** A timestamp `daysAgo` days back at `hour:minute`, never in the future. */
function at(daysAgo: number, hour: number, minute = 0): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return Math.min(d.getTime(), Date.now() - 5 * 60_000);
}

/**
 * A week of drinks and meals, oldest first; the last value is today. Water
 * in ml, sodium in mg, sugar in g, caffeine in mg, alcohol in standard
 * drinks. Two days
 * run over the sodium target, so the gadget shows its hatched and solid bars.
 */
const WEEK = {
  water: [1480, 1720, 1390, 1610, 1260, 1840, 946],
  sodium: [1420, 1880, 1310, 1550, 1190, 2240, 1003],
  sugar: [22, 35, 18, 28, 14, 44, 25],
  caffeine: [143, 190, 95, 143, 238, 95, 143],
  alcohol: [0, 0, 0, 0, 1.4, 2.8, 0],
} as const;

/** Home's Today gadget: seven days of water, sodium, caffeine and alcohol. */
export async function seedTodayPreview(database: AppDatabase): Promise<void> {
  const intake: IntakeRecord[] = [];
  const substances: SubstanceRecord[] = [];
  for (let i = 0; i < 7; i++) {
    const daysAgo = 6 - i;
    const water = WEEK.water[i] ?? 0;
    // Three drinks a day: morning, early afternoon and evening.
    [0.4, 0.35, 0.25].forEach((share, p) => {
      intake.push({
        id: generateId(),
        type: "water",
        amount: Math.round(water * share),
        timestamp: at(daysAgo, 8 + p * 5, 15),
        source: "manual",
        ...syncFields(),
      });
    });
    const sodium = WEEK.sodium[i] ?? 0;
    intake.push(
      {
        id: generateId(),
        type: "salt",
        amount: Math.round(sodium * 0.45),
        timestamp: at(daysAgo, 12, 30),
        source: "manual",
        note: "Lunch",
        ...syncFields(),
      },
      {
        id: generateId(),
        type: "salt",
        amount: Math.round(sodium * 0.55),
        timestamp: at(daysAgo, 19, 0),
        source: "manual",
        note: "Dinner",
        ...syncFields(),
      },
    );
    intake.push({
      id: generateId(),
      type: "sugar",
      amount: WEEK.sugar[i] ?? 0,
      timestamp: at(daysAgo, 15, 30),
      source: "manual",
      ...syncFields(),
    });
    const caffeine = WEEK.caffeine[i] ?? 0;
    if (caffeine > 0) {
      substances.push({
        id: generateId(),
        type: "caffeine",
        amountMg: caffeine,
        volumeMl: 250,
        description: "Coffee",
        source: "standalone",
        aiEnriched: false,
        timestamp: at(daysAgo, 7, 45),
        ...syncFields(),
      });
    }
    const alcohol = WEEK.alcohol[i] ?? 0;
    if (alcohol > 0) {
      substances.push({
        id: generateId(),
        type: "alcohol",
        amountStandardDrinks: alcohol,
        abvPercent: 13,
        volumeMl: Math.round((alcohol * 10) / 0.789 / 0.13),
        description: "Red wine",
        source: "standalone",
        aiEnriched: false,
        timestamp: at(daysAgo, 20, 0),
        ...syncFields(),
      });
    }
  }
  await database.intakeRecords.bulkAdd(intake);
  await database.substanceRecords.bulkAdd(substances);
}

/** A few days of every record type, for Metrics › Records. */
export async function seedRecordsPreview(database: AppDatabase): Promise<void> {
  await seedLiquidsPreview(database);
  await seedFoodSaltPreview(database);
  await seedBloodPressurePreview(database);
  await seedWeightPreview(database);
  await seedBathroomPreview(database);
}

interface SampleMedication {
  generic: string;
  brand: string;
  indication: string;
  strength: number;
  times: { time: string; dosage: number }[];
  stock: number;
  refillAlertPills: number;
  pillShape: InventoryItem["pillShape"];
  pillColor: string;
  food: MedicationPhase["foodInstruction"];
}

const SAMPLE_MEDICATIONS: SampleMedication[] = [
  {
    generic: "Furosemide",
    brand: "Lasix",
    indication: "Fluid retention",
    strength: 40,
    times: [
      { time: "08:00", dosage: 40 },
      { time: "14:00", dosage: 40 },
    ],
    // Under its reorder threshold, so the schedule warns about stock.
    stock: 6,
    refillAlertPills: 10,
    pillShape: "round",
    pillColor: "#FFFFFF",
    food: "none",
  },
  {
    generic: "Spironolactone",
    brand: "Aldactone",
    indication: "Heart failure",
    strength: 25,
    times: [{ time: "08:00", dosage: 25 }],
    stock: 42,
    refillAlertPills: 7,
    pillShape: "round",
    pillColor: "#F5DEB3",
    food: "after",
  },
  {
    generic: "Metoprolol",
    brand: "Lopressor",
    indication: "Blood pressure",
    strength: 50,
    times: [
      { time: "08:00", dosage: 50 },
      { time: "20:00", dosage: 50 },
    ],
    stock: 55,
    refillAlertPills: 14,
    pillShape: "oval",
    pillColor: "#FFC0CB",
    food: "after",
  },
];

/**
 * Three prescriptions with schedules and stock, one of them running low.
 * Yesterday's doses are all taken; today's morning doses are taken once
 * their time has passed, so the schedule shows taken and pending rows.
 */
export async function seedMedicationsPreview(database: AppDatabase): Promise<void> {
  const tz = getDeviceTimezone();
  const now = Date.now();
  const today = toLocalDateKey(now);
  const yesterday = toLocalDateKey(now - DAY_MS);
  const prescriptions: Prescription[] = [];
  const phases: MedicationPhase[] = [];
  const schedules: PhaseSchedule[] = [];
  const items: InventoryItem[] = [];
  const transactions: InventoryTransaction[] = [];
  const doses: DoseLog[] = [];

  for (const med of SAMPLE_MEDICATIONS) {
    const rx: Prescription = {
      id: generateId(),
      genericName: med.generic,
      indication: med.indication,
      compounds: [{ name: med.generic, strength: med.strength }],
      isActive: true,
      ...baseSyncFields(),
    };
    const phase: MedicationPhase = {
      id: generateId(),
      prescriptionId: rx.id,
      type: "maintenance",
      unit: "mg",
      startDate: now - 60 * DAY_MS,
      foodInstruction: med.food,
      status: "active",
      ...baseSyncFields(),
    };
    const item: InventoryItem = {
      id: generateId(),
      prescriptionId: rx.id,
      brandName: med.brand,
      currentStock: med.stock,
      strength: med.strength,
      unit: "mg",
      pillShape: med.pillShape,
      pillColor: med.pillColor,
      refillAlertDays: 7,
      refillAlertPills: med.refillAlertPills,
      isActive: true,
      isArchived: false,
      ...syncFields(),
    };
    prescriptions.push(rx);
    phases.push(phase);
    items.push(item);
    transactions.push({
      id: generateId(),
      inventoryItemId: item.id,
      timestamp: now - 30 * DAY_MS,
      amount: med.stock,
      type: "initial",
      ...syncFields(),
    });

    for (const slot of med.times) {
      const schedule: PhaseSchedule = {
        id: generateId(),
        phaseId: phase.id,
        time: slot.time,
        scheduleTimeUTC: localHHMMStringToUTCMinutes(slot.time, tz),
        anchorTimezone: tz,
        dosage: slot.dosage,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
        unit: "mg",
        ...baseSyncFields(),
      };
      schedules.push(schedule);

      const [hh = 0, mm = 0] = slot.time.split(":").map(Number);
      const due = new Date(now);
      due.setHours(hh, mm, 0, 0);
      const takenToday = due.getTime() + 4 * 60_000;
      const taken: Array<[string, number]> = [[yesterday, takenToday - DAY_MS]];
      if (hh < 12 && takenToday < now) taken.push([today, takenToday]);
      for (const [date, takenAt] of taken) {
        doses.push({
          id: generateId(),
          prescriptionId: rx.id,
          phaseId: phase.id,
          scheduleId: schedule.id,
          inventoryItemId: item.id,
          scheduledDate: date,
          scheduledTime: slot.time,
          status: "taken",
          kind: "scheduled",
          doseAmount: slot.dosage,
          doseUnit: "mg",
          pillsConsumed: slot.dosage / med.strength,
          pillStrength: med.strength,
          actionTimestamp: takenAt,
          ...syncFields(),
        });
      }
    }
  }

  await database.prescriptions.bulkAdd(prescriptions);
  await database.medicationPhases.bulkAdd(phases);
  await database.phaseSchedules.bulkAdd(schedules);
  await database.inventoryItems.bulkAdd(items);
  await database.inventoryTransactions.bulkAdd(transactions);
  await database.doseLogs.bulkAdd(doses);
}
