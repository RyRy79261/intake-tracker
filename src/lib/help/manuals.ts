import {
  Activity,
  BookOpen,
  CalendarClock,
  Compass,
  CupSoda,
  Droplets,
  HeartPulse,
  Mic,
  Pencil,
  Pill,
  PlusCircle,
  Salad,
  Scale,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Bath,
  type LucideIcon,
} from "lucide-react";

/**
 * Content model for the in-app user manual. Each `Manual` is a self-contained
 * guide for one component or interaction; manuals are grouped into domains for
 * the help index. Content is plain structured data so new manuals can be added
 * here without touching any rendering code.
 */

export type ManualDomainId =
  | "getting-started"
  | "intake"
  | "health"
  | "medications"
  | "voice"
  | "ai"
  | "system";

export type CalloutTone = "tip" | "note" | "warning" | "privacy";

export interface Callout {
  tone: CalloutTone;
  text: string;
}

export interface ManualSection {
  heading: string;
  /** Intro prose. Split into paragraphs on a blank line. */
  body?: string;
  /** Ordered how-to steps, rendered as a numbered list. */
  steps?: string[];
  /** Unordered points, rendered as a bullet list. */
  bullets?: string[];
  /** Highlighted aside shown after the section's other content. */
  callout?: Callout;
}

export interface Manual {
  slug: string;
  title: string;
  domain: ManualDomainId;
  icon: LucideIcon;
  /** One-line description used on the index and as the page subtitle. */
  summary: string;
  /** Where the feature lives in the app. */
  whereToFind: string;
  sections: ManualSection[];
}

export interface ManualDomain {
  id: ManualDomainId;
  label: string;
  blurb: string;
  icon: LucideIcon;
  colorClass: string;
}

export const MANUAL_DOMAINS: ManualDomain[] = [
  {
    id: "getting-started",
    label: "Getting started",
    blurb: "New here? Start with the big picture.",
    icon: Compass,
    colorClass: "text-sky-600 dark:text-sky-400",
  },
  {
    id: "intake",
    label: "Food & drink",
    blurb: "Logging what you drink and eat.",
    icon: Droplets,
    colorClass: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "health",
    label: "Health metrics",
    blurb: "Vitals and body measurements.",
    icon: HeartPulse,
    colorClass: "text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "medications",
    label: "Medications",
    blurb: "Prescriptions, doses and titrations.",
    icon: Pill,
    colorClass: "text-teal-600 dark:text-teal-400",
  },
  {
    id: "voice",
    label: "Voice",
    blurb: "Hands-free logging.",
    icon: Mic,
    colorClass: "text-violet-600 dark:text-violet-400",
  },
  {
    id: "ai",
    label: "AI & privacy",
    blurb: "Optional smart helpers and your data.",
    icon: Sparkles,
    colorClass: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "system",
    label: "App & settings",
    blurb: "Configuring the app.",
    icon: SlidersHorizontal,
    colorClass: "text-slate-600 dark:text-slate-400",
  },
];

export const MANUALS: Manual[] = [
  {
    slug: "how-it-works",
    title: "How Intake Tracker works",
    domain: "getting-started",
    icon: Compass,
    summary: "What the app is, where your data lives, and how to get around.",
    whereToFind: "Everywhere — this is the big picture.",
    sections: [
      {
        heading: "What this app is for",
        body: "Intake Tracker is a personal health log. It keeps a record of your hydration, nutrition, vitals and medications in one place so you can manage a chronic condition day to day.\n\nIt is a single-person app. Everything you see belongs to you — there is no feed, no sharing, and no other users.",
      },
      {
        heading: "Your data lives on your device",
        body: "The app is offline-first. Every entry is saved straight into your phone or browser's own storage, so logging works with no signal and the app loads instantly.",
        callout: {
          tone: "privacy",
          text: "Nothing leaves your device unless you turn on cloud sync or use an AI feature — and even then, only the minimum needed is sent. See the Privacy manual for the full picture.",
        },
      },
      {
        heading: "Daily budgets, not just totals",
        body: "Water and sodium are tracked against a daily budget rather than a running lifetime total. The progress rings and bars show how much of today's allowance you have used.\n\nThe day rolls over at an hour you choose, so a late-night drink still counts toward the correct day. Set it under Settings → Tracking → Day start.",
      },
      {
        heading: "Getting around",
        bullets: [
          "Five tabs sit along the top: Intake (home), Medications, Analytics, Settings and Profile.",
          "Swipe left or right anywhere to move between those tabs.",
          "The quick-nav bar at the bottom of the home screen jumps straight to a card.",
          "Shaking your device opens the bug reporter — and from there you can reach this manual.",
        ],
      },
      {
        heading: "Where to go next",
        body: "Each card and feature has its own manual in this section. If you are setting up for the first time, the food, drink and medication guides are a good place to start.",
      },
    ],
  },
  {
    slug: "logging-drinks",
    title: "Logging water & drinks",
    domain: "intake",
    icon: CupSoda,
    summary: "Track water and any other drink against your daily fluid budget.",
    whereToFind: "Home screen → Water & drinks card",
    sections: [
      {
        heading: "Three tabs, three ways to log",
        bullets: [
          "Water — quick taps for plain water.",
          "Beverage — log any drink by name and volume, including alcohol by its ABV.",
          "Preset — your saved favourite drinks, ready for one tap.",
        ],
      },
      {
        heading: "Logging plain water",
        steps: [
          "Open the Water tab on the card.",
          "Tap the add button to log one serving. The serving size comes from Settings → Tracking → Water.",
          "Tap again for more — the ring fills as you approach your daily limit.",
        ],
      },
      {
        heading: "Logging another drink",
        steps: [
          "Open the Beverage tab.",
          "Enter the drink's name and volume.",
          "For an alcoholic drink, set its ABV so units are tracked correctly.",
          "Save the entry.",
        ],
      },
      {
        heading: "Saving favourites as presets",
        body: "Drinks you log often can become presets so they are one tap away on the Preset tab. Add and edit them under Settings → Tracking → Liquid presets.",
        callout: {
          tone: "tip",
          text: "The Preset tab can also use AI to recognise a drink you describe and fill in its details automatically — see the AI features manual.",
        },
      },
      {
        heading: "Fixing a mistake",
        body: "Logged the wrong amount? Every drink appears in the card's recent list. See the Editing & correcting entries manual to change or delete one.",
      },
    ],
  },
  {
    slug: "food-and-sodium",
    title: "Tracking food, sodium & sugar",
    domain: "intake",
    icon: Salad,
    summary: "Log meals and keep your sodium and sugar intake within budget.",
    whereToFind: "Home screen → Food card",
    sections: [
      {
        heading: "What it tracks",
        body: "The Food card tracks sodium (salt) and sugar. Two progress bars show how much of each daily allowance you have used — the defaults are 1500 mg sodium and 30 g sugar, adjustable under Settings → Sodium Settings and Settings → Sugar Settings.\n\nFood can also carry water content, which counts toward your fluid total.",
      },
      {
        heading: "Logging a meal",
        steps: [
          "Open the Food card.",
          "Describe what you ate.",
          "Enter the sodium amount if you know it from a label, or use the AI helper below.",
          "Optionally add a sugar estimate — handy for keeping an eye on sugar intake.",
          "Save the entry.",
        ],
      },
      {
        heading: "The sparkle button",
        body: "A small sparkle icon sits inside the food input. Type a plain-language description like \"two slices of pizza\", tap the sparkle, and the app estimates the sodium, sugar and water content for you, with a short note explaining the estimate.",
        callout: {
          tone: "note",
          text: "The sparkle only appears once an Anthropic API key is set up. See the AI features & API keys manual to switch it on.",
        },
      },
      {
        heading: "Building a composed meal",
        body: "For a meal made of several items, you can assemble it from parts and review the combined totals in the preview before saving.",
        callout: {
          tone: "tip",
          text: "AI estimates are a starting point. If you have the packaging, trust the label and adjust the number.",
        },
      },
    ],
  },
  {
    slug: "blood-pressure",
    title: "The blood pressure card",
    domain: "health",
    icon: Activity,
    summary: "Record systolic, diastolic and heart rate with at-a-glance colour coding.",
    whereToFind: "Home screen → Blood pressure card",
    sections: [
      {
        heading: "What to enter",
        bullets: [
          "Systolic — the top (higher) number on your monitor.",
          "Diastolic — the bottom (lower) number.",
          "Heart rate — your pulse, in beats per minute.",
        ],
      },
      {
        heading: "Logging a reading",
        steps: [
          "Open the Blood pressure card.",
          "Enter systolic, diastolic and heart rate from your monitor.",
          "If the reading was taken earlier, open the time control and set when it happened.",
          "Save the entry.",
        ],
      },
      {
        heading: "Reading the colours",
        body: "The card colour-codes pulse pressure — the gap between systolic and diastolic — so an unusually wide or narrow reading stands out at a glance. Recent readings are listed just below the card, and the Analytics page plots the trend over time.",
        callout: {
          tone: "warning",
          text: "This app records numbers; it does not diagnose. Always discuss your readings with your clinician.",
        },
      },
    ],
  },
  {
    slug: "weight",
    title: "The weight card",
    domain: "health",
    icon: Scale,
    summary: "Log your weight and follow the trend over time.",
    whereToFind: "Home screen → Weight card",
    sections: [
      {
        heading: "Logging your weight",
        steps: [
          "Open the Weight card.",
          "Enter your current weight.",
          "Adjust the date or time if you are logging an earlier weigh-in.",
          "Save the entry.",
        ],
      },
      {
        heading: "Units and target",
        body: "Choose kilograms or pounds, and set an optional target weight, under Settings → Tracking → Weight.",
      },
      {
        heading: "Seeing the trend",
        body: "The card shows your recent entries and the direction of travel. For the full picture, the Analytics page → Summary tab plots weight across the date range you pick.",
        callout: {
          tone: "tip",
          text: "Weigh yourself at a consistent time of day — first thing in the morning works well — so the numbers are comparable.",
        },
      },
    ],
  },
  {
    slug: "urination-and-bowel",
    title: "Urination & bowel movements",
    domain: "health",
    icon: Bath,
    summary: "Log bathroom visits — frequency, amount and consistency.",
    whereToFind: "Home screen → Urination and Bowel movement cards",
    sections: [
      {
        heading: "Two cards, the same idea",
        body: "The home screen has two separate cards. The Urination card records how often you go and roughly how much. The Bowel movement card records frequency, amount and an optional consistency note.",
      },
      {
        heading: "Logging a visit",
        steps: [
          "Open the relevant card.",
          "Pick the amount.",
          "On the bowel card, add a consistency note if it is worth recording.",
          "Adjust the time if the visit happened earlier, then save.",
        ],
      },
      {
        heading: "Setting your defaults",
        body: "The amount options and the frequency thresholds that flag an unusual day come from Settings → Tracking → Urination & bowel defaults.",
        callout: {
          tone: "note",
          text: "Every entry can be corrected later from the card's recent list — see the Editing & correcting entries manual.",
        },
      },
    ],
  },
  {
    slug: "editing-entries",
    title: "Editing & correcting entries",
    domain: "intake",
    icon: Pencil,
    summary: "Fix a wrong amount, change a time, or delete something logged by mistake.",
    whereToFind: "Any card's recent list, or Analytics → Records",
    sections: [
      {
        heading: "Saving is instant",
        body: "There is no separate \"save all\" step. The moment you confirm an entry it is written to your device's storage. That means a mistake is saved too — but every entry stays editable.",
      },
      {
        heading: "Editing a recent entry",
        steps: [
          "Find the entry in the recent list just below its card.",
          "Tap it to open its edit dialog.",
          "Change the amount, notes or timestamp.",
          "Save your changes — or tap Delete to remove the entry entirely.",
        ],
      },
      {
        heading: "Editing older entries",
        body: "Anything that has scrolled off the recent list is still reachable from the Analytics page → Records tab — a filterable table of every record you have logged. Tap a row to open the same edit dialog.",
      },
      {
        heading: "Fixing the time",
        body: "Most entries default to \"now\". The collapsible time control lets you set when something actually happened. This matters for your daily budget: an entry's time decides which day it counts toward, based on your day-start hour.",
        callout: {
          tone: "tip",
          text: "Took a medication dose late? Doses have their own retroactive time picker — see Your medication schedule & doses.",
        },
      },
    ],
  },
  {
    slug: "adding-medication",
    title: "Adding a medication",
    domain: "medications",
    icon: PlusCircle,
    summary: "Add a prescription with the step-by-step wizard.",
    whereToFind: "Medications page → + button",
    sections: [
      {
        heading: "Starting the wizard",
        body: "Tap the + button on the Medications page to open the Add medication wizard. It walks you through a few steps, one screen at a time, and you can move back to an earlier step at any point.",
      },
      {
        heading: "The steps",
        steps: [
          "Search — find the drug by name and pick the brand or generic form.",
          "Appearance — set the pill's colour, shape and any imprint so it is easy to recognise.",
          "Indication — note what you are taking it for.",
          "Dosage — set the strength and how much you take.",
          "Schedule — choose the times of day and the days of the week.",
          "Inventory — enter how many you currently have and a reorder threshold.",
        ],
      },
      {
        heading: "The drug interaction check",
        body: "If AI is set up, the wizard can run a conflict check that compares the new medication against the ones you already take and flags possible interactions before you finish.",
        callout: {
          tone: "note",
          text: "Everything entered in the wizard can be changed later from the medication's edit drawer — nothing here is permanent.",
        },
      },
    ],
  },
  {
    slug: "medication-schedule",
    title: "Your medication schedule & doses",
    domain: "medications",
    icon: CalendarClock,
    summary: "Take, skip and adjust scheduled doses, and keep track of stock.",
    whereToFind: "Medications page → schedule",
    sections: [
      {
        heading: "The daily schedule",
        body: "The Medications page lays out each day's doses grouped by time of day. A summary at the top tracks how many doses you have taken and warns you when a medication is running low.",
      },
      {
        heading: "Taking or skipping a dose",
        steps: [
          "Find the dose in the schedule.",
          "Tap Take when you take it.",
          "If you took it earlier, use the retroactive time picker to record the real time.",
          "To skip a dose, tap Skip and choose a reason — side effects, ran out, and so on.",
        ],
      },
      {
        heading: "Other days and inventory",
        body: "Use the week-day selector to move between dates; each dose shows whether it is taken, pending or skipped. Taking a dose reduces that medication's pill count, and you get a low-stock warning once it reaches your reorder threshold.",
      },
      {
        heading: "Titrations",
        body: "If a dose is being stepped up or down over time, a titration plan schedules those changes automatically so the schedule always shows the right amount. Manage plans in the titrations view on the Medications page.",
        callout: {
          tone: "tip",
          text: "Tapped Take or Skip by accident? An undo button appears in the toast straight after — use it before it disappears.",
        },
      },
    ],
  },
  {
    slug: "voice-operator",
    title: "The voice operator",
    domain: "voice",
    icon: Mic,
    summary: "Log several things at once, hands-free, just by talking.",
    whereToFind: "Home screen → Voice log button",
    sections: [
      {
        heading: "What it does",
        body: "The voice operator lets you describe everything in one go — \"blood pressure 120 over 80, heart rate 65, a coffee and a glass of water\" — and the app sorts what you said into the right entries: vitals, drinks, food, weight and more.",
      },
      {
        heading: "Using it",
        steps: [
          "Tap the Voice log button on the home screen.",
          "Tap record and describe your readings, drinks, food or weight — all in one take.",
          "Stop recording. The app turns your speech into text and parses it into rows.",
          "Review each parsed row, correct anything that is wrong, then approve to save.",
        ],
      },
      {
        heading: "Nothing saves until you approve",
        body: "Parsed items are always shown for review first. You can edit any value or reject a row entirely — only the rows you approve become real entries.",
        callout: {
          tone: "note",
          text: "Voice needs a Groq key for transcription and an Anthropic key for parsing. See the AI features & API keys manual.",
        },
      },
      {
        heading: "What is sent",
        body: "Your recording is sent to a speech service to be turned into text, and that text is then parsed by an AI service. See the Privacy & your data manual for exactly what leaves your device.",
      },
    ],
  },
  {
    slug: "ai-features",
    title: "AI features & API keys",
    domain: "ai",
    icon: Sparkles,
    summary: "What the AI helpers do and how to switch them on with your own keys.",
    whereToFind: "Settings → AI features",
    sections: [
      {
        heading: "The app works without AI",
        body: "Every core feature — logging, schedules, editing, history and analytics — works with no AI at all. AI is an optional layer that mostly saves you typing and guesswork.",
      },
      {
        heading: "What the AI helpers do",
        bullets: [
          "Food & drink parsing — the sparkle button estimates sodium and water from a plain description.",
          "Beverage & substance lookup — fills in a drink's content so you do not have to.",
          "Medicine search — finds drug details while you add a medication.",
          "Voice operator — transcribes a spoken log and sorts it into entries.",
          "Interactions & insights — drug interaction checks and AI summaries on the Analytics page.",
        ],
      },
      {
        heading: "Turning AI on",
        steps: [
          "Go to Settings → AI features.",
          "Add an Anthropic API key — this powers parsing, lookup, medicine search and insights.",
          "Optionally add a Groq key — this powers voice transcription.",
          "Once a key is saved, the AI buttons such as the sparkle appear automatically across the app.",
        ],
      },
      {
        heading: "Whose keys, and the cost",
        body: "You can use your own API keys, or shared keys where they are made available. Usage on a key is billed by the provider that issued it, so a personal key means personal billing.",
        callout: {
          tone: "privacy",
          text: "Before any text is sent to an AI service, personal details such as emails, phone numbers and ID-like numbers are stripped out. See the Privacy & your data manual.",
        },
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy & your data",
    domain: "ai",
    icon: ShieldCheck,
    summary: "Where your data lives, what leaves your device, and the controls you hold.",
    whereToFind: "Settings → Privacy & Security",
    sections: [
      {
        heading: "Local first",
        body: "All of your health data is stored on your own device, in the browser's database. The app is fully usable offline, and core tracking never requires an account.",
      },
      {
        heading: "Cloud sync is optional",
        body: "If you sign in and turn on sync, your data is mirrored to a private cloud database so it survives a lost device and reaches your other devices. It remains yours alone — this is a single-user app — and sync is off until you choose to enable it.",
      },
      {
        heading: "What is sent to AI services",
        body: "When you use an AI feature, only the text needed for that task is sent to the AI provider, and identifying details — emails, phone numbers, ID-like numbers — are removed first. Bug reports do the same with environment information and error logs.",
      },
      {
        heading: "Medical context consent",
        body: "AI insight features that would draw on your conditions or medications stay off until you opt in. Per-item toggles under Settings → Privacy & Security — and on your Profile — control this, and a disclaimer is shown the first time you enable one.",
      },
      {
        heading: "Permissions",
        body: "Motion access (for shake-to-report), the microphone (for voice) and notifications are each requested only when you turn on the feature that needs them. Review what you have granted under Settings → Privacy & Security.",
        callout: {
          tone: "tip",
          text: "You can export a full backup of your data at any time from Settings → Data & Storage.",
        },
      },
    ],
  },
  {
    slug: "settings",
    title: "Settings & customization",
    domain: "system",
    icon: SlidersHorizontal,
    summary: "A tour of every settings group and what you can change.",
    whereToFind: "Settings tab",
    sections: [
      {
        heading: "How settings are organised",
        body: "The Settings page is a stack of collapsible groups. Tap a group to expand it. Changes take effect as you make them — there is no save button.",
      },
      {
        heading: "The groups",
        bullets: [
          "AI features — API keys for the optional AI helpers.",
          "Data & Storage — storage usage, export, import, backup and data migration.",
          "Tracking — day-start hour, water and salt limits, weight units, liquid presets and bathroom defaults.",
          "Customization — theme and dark mode, the quick-nav bar, animation timing and swipe navigation.",
          "Medication — time format and inventory and notification preferences.",
          "Privacy & Security — app permissions and medical-AI consent.",
          "System — checking for and applying app updates.",
          "Feedback — reporting a bug, and the shake-to-report sensitivity.",
        ],
      },
      {
        heading: "Resetting",
        body: "Reset to Defaults, at the bottom of the page, restores every preference to its original value. It does not delete any of your logged data — only your settings.",
        callout: {
          tone: "tip",
          text: "This manual is reachable from Settings → Help & Manual, and from the \"Wanna read the manual?\" prompt (the \"Open the manual\" button) in the shake / bug-report dialog.",
        },
      },
    ],
  },
];

export function getManual(slug: string): Manual | undefined {
  return MANUALS.find((m) => m.slug === slug);
}

export function getManualsByDomain(): { domain: ManualDomain; manuals: Manual[] }[] {
  return MANUAL_DOMAINS.map((domain) => ({
    domain,
    manuals: MANUALS.filter((m) => m.domain === domain.id),
  })).filter((group) => group.manuals.length > 0);
}

export const HELP_INDEX_ICON = BookOpen;
