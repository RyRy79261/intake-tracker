# Medisafe parity plan: Medications section

Date: 2026-10-19. Branch at time of writing: `feat/voice-medications` (merged as PR #444 on 2026-10-19). Start each PR in this plan from `main`.

This plan is written in ASD-STE100 Simplified Technical English. Each sentence has one idea. All paths are relative to the repository root unless a full path is given.

## 0. Goal and rules

- The goal is workflow parity with Medisafe for one user. We copy the Medisafe workflow. We do not invent new workflows.
- We change Medisafe behaviour only where this plan says so. Each change has a reason.
- The owner's decisions in section 8 (2026-10-19) override the Medisafe research. Where they differ, this plan follows the owner. Section 1 keeps the Medisafe facts and marks each difference "Owner decision".
- The owner uses the Android app (Capacitor shell). Android is the primary target for reminders.
- The owner will not use the section until it is complete. A partial workflow is not useful to the owner.
- Labels in this plan are the exact text for the UI.

### Evidence labels

- **[APK]**: Medisafe Android build 20880 (strings, layouts, decompiled code). This is the strongest evidence.
- **[HC]**: Medisafe help centre article.
- **[SS]**: Google Play or App Store screenshot.
- **[REV]**: review or user comment. Treat it as weak.
- **[OWNER]**: the owner's own description of the app on his phone.
- **Unconfirmed**: no source states it. We infer it.

## 1. Medisafe reference

### 1.1 Today (timeline) screen

| Item | Behaviour | Evidence |
|---|---|---|
| Week strip | A 7-day strip. The selected day is in a filled circle. A line under it says "Today, Apr 17". Swipe changes the day. | [SS], [APK] |
| Groups | One card for each exact scheduled time ("bucket"). The cards are in time order. | [APK] |
| Group key | A dose stays under its ORIGINAL scheduled time. A rescheduled dose does not move. | [APK], [HC 8103007] |
| Time header | Shows the time, for example "8:00 AM". The time text is in the primary colour when the slot is within 1 hour of now. | [APK] |
| "Mark All Doses" | At the right end of the time header. It shows only when the slot has 2 or more meds. | [APK], [SS] |
| Med row | Pill image (user-chosen shape and colour), name, then "5 mg, Take 1 with food". A status badge sits on the pill image (taken, missed, skipped, snoozed). | [SS], [APK] |
| Row colours | Missed text and skipped text have their own colours. A rescheduled dose uses the primary colour. Exact colour values are unconfirmed. | [APK] |
| Auto-scroll | On open, the list scrolls to the slot nearest to now. | [APK] |
| Floating chip | "Unmarked meds" or "Snoozed meds" appears when such doses are off screen. A tap scrolls to them. | [APK] |
| Empty state | "No meds today!" | [APK] |
| History range | 30 days back on the Today screen. | [HC 9146319] |

### 1.2 "Mark all doses" modal

| Item | Behaviour | Evidence |
|---|---|---|
| Container | A full-screen overlay. The title is the slot time. It has a close (X) icon and a list of the slot's meds. A tap on a med opens its single-dose dialog. | [APK] |
| Buttons | Skip All, Take All, Reschedule. "Take All" changes to "UN-TAKE" when all doses are taken. "Skip All" changes to "UN-SKIP" when all doses are skipped. There is no separate "Untake all" button. | [APK] |
| Owner's labels | Skip all, Take all, Untake all, Reschedule. **Owner decision:** we use these labels. "Take all" records the current time ("Take now"). | [OWNER] |
| Mixed slot warning | When at least one dose is already marked, the first bulk action asks "Take all 8:30 AM meds?" with "This will override any previously marked medications. Alternatively, you can mark each med separately." It has Take / Cancel and "Don't show again". Skip and Reschedule have the same dialog. **Owner decision:** a bulk action changes only doses with no user action yet. It never overrides a taken or skipped dose. So we have no override warning. | [APK] |
| Result | An overlay says "3 meds taken". Each row animates to the new status. Then the modal closes. | [APK] |
| Reschedule all | A sheet "Reschedule for" with a time picker and a date switcher. The time must be at least 2 minutes from now. A toast says "3 meds rescheduled for 10:00 AM". **Owner decision:** no time limit (section 5.3). | [APK] |

### 1.3 Late or early take: "When did you take your meds?"

| Item | Behaviour | Evidence |
|---|---|---|
| Threshold | 1 hour from the ORIGINAL scheduled time. It is symmetric: early by more than 1 hour also asks. | [APK], [REV] |
| Owner's threshold | About 45 minutes. **Owner decision:** a "Late window" setting, default 40 minutes. It applies only AFTER the dose time. | [OWNER] |
| Inside the threshold | Take records "now" with no prompt. | [APK] |
| Outside the threshold | A sheet opens. Title "When did you take your meds?". Options "On Time (8:30 AM)", "Now (10:12 AM)", "Pick exact time". **Owner decision:** the options are "Take now", "Take at a specific time" and "Skip". | [APK] |
| Early | "On Time" is hidden when the dose is early. A warning says "Future doses - consider if it's safe to take it now." **Owner decision:** no prompt and no warning for an early tap. Take records the current time. | [APK] |
| Pick exact time | A time picker and a date switcher. The time must be in the past ("Please specify time in the past"). **Owner decision:** no time limit. The user can state any time (section 4.6). | [APK] |
| Long-press Take | Always opens the same options, also inside the threshold. The help centre names them "Now", "On Time" and "Set Time" ("Select Time" opens a date and time picker). | [HC 8103135], [APK] |
| Applies to | Single Take and Take All. | [APK] |

### 1.4 Single-dose dialog

| Item | Behaviour | Evidence |
|---|---|---|
| Toolbar | Info, delete ("Only this dose" / "All future doses"), edit. | [HC 8103000], [HC 8103128] |
| Status line | "Taken at 8:32 AM", "Skipped at …", "Missed", "Rescheduled for 10:00 AM", "Snoozed until 9:10 AM". | [APK] |
| Warnings | Overdue and untouched: "You haven't taken any action for this dose. Consider if it's safe to take now." Future: "Future dose - consider if it's safe to take it now." | [APK] |
| Body | "Scheduled for 8:30 AM", dose and food instruction, note, "N pills left", "Last taken at …". | [APK] |
| Actions | SKIP, TAKE, RESCHEDULE. TAKE changes to UN-TAKE when taken. SKIP changes to UN-SKIP when skipped. | [APK], [SS] |
| Un-take | The dose goes back to pending if its time is still in the future. Otherwise it goes to missed. | [APK] |
| Fix a taken time | Un-take, then long-press Take and pick the time. | [HC 8102984] |
| Toolbar actions in our plan | Info and Edit are kept (section 4.5). Delete "Only this dose" is replaced by Skip, because a deleted scheduled dose cannot be told apart from a dose with no action. | Change from Medisafe |

### 1.5 Skip reason

- After Skip or Skip All, a sheet asks "Can you please indicate why you're skipping this dose?" [APK].
- The options, in order: Med isn't near me; Forgot / busy / asleep; Ran out of the med; Don't need to take this dose; Side effects / other health concerns; Worried about the cost; Other [APK].
- A switch "Ask me every time" is ON by default [APK].
- The sheet can be dismissed. A reason is not mandatory in build 20880 [APK]. An older review says it was mandatory [REV].

### 1.6 Reschedule

- Reschedule applies to one dose, or to all doses of a slot from the modal [HC 8103007], [APK].
- The user picks a new date AND time. The help centre states no limit on how far a dose can move [HC 8103007]. **Owner decision:** we also have no limit.
- Internally the status becomes "snooze". The new time is stored as `actualDateTime`. The original time does not change [APK].
- The dose stays under its original time on the Today screen. Only the reminder moves [HC 8103007].
- Later doses do not move [HC 9827604]. Users complain about this [REV].
- Rescheduling restarts the missed-dose timer [HC 8395236].
- A change to the regular schedule is a med edit, not a reschedule [HC 8102918], [HC 8102938].

### 1.7 States

- Statuses: pending, taken, skipped ("dismissed"), snoozed or rescheduled ("snooze"), missed [APK].
- A pending or snoozed dose becomes MISSED after `snooze × (maxReminders − 1)` past its time. The defaults are 10 minutes and 4 reminders. So a dose is missed 30 minutes after its time [APK].
- **Owner decision:** Missed is automatic. A dose with no user action (taken, skipped or rescheduled) at the end of the reminder period becomes Missed. It stays Missed until the user changes it. Skipped and Taken come only from a user action (section 5.8).

### 1.8 Reminders

| Item | Behaviour | Evidence |
|---|---|---|
| Grouping | One reminder for each time slot. | [REV], [SS ios12]; Android grouping is unconfirmed |
| Reminder screen | "Hello Ana, it's time to take your 10:30 AM meds." A list of the slot's meds with dose and instruction. Skip / Snooze / Take All. Chips for earlier missed slots. | [APK], [SS] |
| Notification actions | Android: you can mark a dose from the notification without opening the app [HC 8103130]. The labels Take, Skip, Snooze are from a Medisafe FAQ [HC]. "Take All" and "Snooze All" for a slot are from an iPhone blog post and reviews; Android labels are unconfirmed. | [HC 8103130], [REV] |
| Med names | Hidden by default for privacy. "Show med names" turns them on. | [HC 8103246] |
| Repeat | iOS repeats every 10 minutes by default [HC 8098013]. Android uses snooze 10 min and max 4 reminders [APK]. **Owner decision:** two settings, "Remind me every" (default 10 minutes) and "Reminder period" (default 30 minutes). An 08:30 dose gets reminders at 08:30, 08:40, 08:50 and 09:00 (section 6.6). | |
| Snooze options | 5, 10, 15, 30, 60, 90, 120 minutes. | [APK] |
| Max reminders | 1 to 10. Default 4. | [APK] |
| Popup | Android "Popup Notification", "Always show popup", "show popup on last reminder". | [HC 8098031] |
| Critical alerts | iOS only. Android follows device volume and Do Not Disturb. | [HC 9650196] |
| Quiet hours | Not found. "Weekend Mode" moves morning reminders later (Android). | [HC 8098169] |
| Evening nudge | "Did you take your meds today?" and a daily missed-meds alert. | [APK] |
| Refill | Pills on hand, a threshold (default "When I have 20 meds remaining"), a reminder time. It repeats daily until refill. The count goes down as doses are taken. | [HC 8103161]; daily repeat is from an old FAQ (unconfirmed) |
| Time zone | A popup offers "Keep times from original time zone" or "Change to new time zone". Android also has "Refresh reminder times" in settings. | [HC 8349516] |

### 1.9 Things Medisafe does not do

- No automatic shift of later doses [HC 9827604].
- No tapering feature. Not found in any source (unconfirmed absence).
- No pause with an automatic resume date (unconfirmed absence).
- No per-med sound [HC 8102972].

### 1.10 Sources

Medisafe help centre articles 8103135, 8102984, 8103007, 9827604, 8098013, 8103261, 8103130, 8103000, 8103128, 8103148, 8097988, 8098031, 8098169, 9650196, 9146319, 8451604, 8103246, 8102972, 8103161, 8102918, 8102938, 8395236, 8349516 (https://help-center.medisafe.com/en/articles/<id>). Medisafe Android APK build 20880 (APKPure, decompiled on 2026-10-19). Play and App Store listings. Reviews: techenhancedlife.com, minimalistjourneys.com, doseanchor.com, David Pogue (Yahoo Finance).

## 2. Where we are

Source: audits of `apps/web/src` on 2026-10-19. Line numbers are in the audit reports.

### 2.1 Today (Schedule tab)

- `components/medications/schedule-view.tsx` groups doses by `localTime`. One `TimeSlotGroup` is shown for each time. This matches Medisafe.
- A rescheduled dose MOVES to its new time header (`lib/dose-schedule-service.ts` uses `rescheduledTo` as `localTime`). Medisafe keeps it under the original time.
- The view does not scroll to the current slot. The "next" slot has only a 3 px stripe.
- "Overdue" and "next" are computed once at render. They do not update while the screen is open.
- The header time is 12-hour. Rows and drawers are 24-hour.
- A dose is never "missed" during its own day.
- The sys-bar badge counts every pending dose of the day, also tonight's.
- Row line 1 shows the GENERIC name (`prescription.genericName`). The reminder builder already has a brand-or-generic `displayName`.
- `resolveDoseStatus` (`lib/dose-status.ts`) is also used by analytics, export, the MCP queries (server side) and the insights snapshot. It maps a "rescheduled" log to pending or missed. It has no "rescheduled" result.

### 2.2 Slot header

- "Skip All" and "Mark All" act only on open doses.
- "Mark All" takes all doses at once if within 30 minutes. If later, or on a past day, it opens a single time picker (default now today, the slot time on a past day). An Undo toast follows in both cases.
- "Skip All" and "Mark All" show also for a slot with one dose.
- "Edit All" shows only when no dose is open. It opens `bulk-dose-edit-dialog.tsx` with UN-TAKE and EDIT RECORD.
- A mixed slot has no bulk untake. An all-skipped slot has no header action. There is no slot reschedule.

### 2.3 Dose row and dialog

- A pending or missed row has Skip and Take buttons. It does NOT open the detail dialog. (A rescheduled log resolves to pending, so it is the same.)
- So RESCHEDULE (in `dose-detail-dialog.tsx`, shown only when the day is today) is reachable only for taken or skipped doses.
- `takeDose` refuses a dose on a future day. A take on a dose that is already taken does not debit stock again, but it DOES overwrite `actionTimestamp` with the new time (`writeSlotLog` always stamps it).
- The detail dialog Take records "now" with no late check.
- The detail dialog Skip writes no reason.
- The dialog mutations have no error handling.
- There is no un-skip.

### 2.4 Late take

- The threshold is 30 minutes. It is hard-coded in two places (`dose-row.tsx`, `schedule-view.tsx`).
- The prompt is a single time input. It has no "On time" or "Now" choice.
- Voice logging uses the save time when no time is spoken.

### 2.5 Reschedule

- `rescheduleDose` writes `status: "rescheduled"` and `rescheduledTo: "HH:MM"` (device-local, no date).
- It does not validate the time.
- It silently un-takes a taken dose and refunds the stock.
- `rescheduledTo` is never cleared. `untakeDose` returns a dose to "rescheduled" when `rescheduledTo` is set, so an old reschedule comes back after any later take and untake.
- The UI passes `slot.localTime` as `time`. For a rescheduled dose that is the NEW time, so `resolveTakenAt` uses the new time as the slot time.
- `isSlotHandled` treats "rescheduled" as handled. So the original reminder is cancelled and no reminder fires at the new time.

### 2.6 Reminders

- **Native Android** (`lib/local-notifications.ts`): one notification per MEDICINE, not per slot. Inexact alarms. No action buttons. No tap handling. Default channel. Follow-ups are pre-booked and cancelled only by an in-app resync.
- **Server web push**: built but not live. The GitHub cron secrets are missing. GitHub runs the job every 2 to 5 hours, so it is not usable.
- **In-page notifier**: runs only while the Medications window is open. It does not work in the Android WebView.
- **Snooze**: not built.
- **Refill alerts**: in-page web only. None on Android.
- **Follow-ups**: synced settings `reminderFollowUpCount` (0 to 3, default 2) and `reminderFollowUpInterval` (5, 10, 15, 20, 30 minutes, default 10).
- **Day key mismatch**: the reminder builder keys an occurrence by its date in the schedule's ANCHOR zone. The Today screen keys a dose by the DEVICE date. When the device is far from the anchor zone (travel with "keep times"), the two keys can differ, so `loadHandledSlots` can miss a taken dose and its follow-ups still fire.
- **Native project**: `apps/native/android` has only `MainActivity.java`. There is no Kotlin setup. The manifest has `POST_NOTIFICATIONS` but no exact-alarm permission.
- **APK bundles the web app**: `capacitor.config.ts` serves the static export from the APK (no `server.url`). So EVERY web change in this plan reaches the phone only with a new APK, not only the reminder PRs.

### 2.7 Other

- Skip reasons: 5 presets plus free text. Not the Medisafe list.
- Undo after a bulk action returns doses to pending, not to their previous state.
- Bulk writes are not atomic. The UI uses `runPerSlot` in `hooks/use-medication-queries.ts`. The service functions `takeAllDoses` and `skipAllDoses` are also per dose.
- A schedule edit rewrites past days (`updateSchedule` edits in place). Taken and skipped logs keep their dose snapshot, but the slot time and the missed doses of past days change.
- Voice logging of doses by slot exists (PR #444, merged). It matches slots by `slot.localTime`, so a change to `localTime` changes voice too.
- A time zone change dialog exists (`timezone-change-dialog.tsx`). It is our copy of Medisafe's time zone popup.
- Each synced setting is a COLUMN of `user_settings` in Postgres. A new synced setting needs a Drizzle migration and the schema parity update.
- Skip reason dialog: the reason choice is also the confirmation. Dismiss cancels the skip.

## 3. Gap table

P0 = blocks daily use by the owner. P1 = needed for "perfect", but the owner can start without it. P2 = later.

| # | Workflow | Medisafe | Ours | Gap | Priority |
|---|---|---|---|---|---|
| 1 | Reminder at dose time on Android | One reminder per slot, exact, repeats, actions | One per medicine, inexact, no actions | Grouping, exactness, actions | P0 |
| 2 | Act from the notification | Take all / Snooze / Skip | Tap opens the app | No actions | P0 |
| 3 | Snooze | Yes, 5 to 120 min | None | Missing | P0 |
| 4 | Reschedule a pending dose | From the dose dialog and the slot modal | Not reachable | Missing | P0 |
| 5 | Reminder after reschedule | Fires at the new time | Silent | Bug | P0 |
| 6 | Mark all doses modal | Modal with list and 3 actions | Direct take or time picker | Missing | P0 |
| 7 | Late take prompt | On time / Now / Pick exact time, outside 60 min (owner: Take now / Take at a specific time / Skip, only after a 40-minute late window) | Single time input, outside 30 min | Wrong options and threshold | P0 |
| 8 | Late check in dialog and voice | Yes | No | Missing | P0 |
| 9 | Untake all, Unskip all | Yes | Only when nothing is open; no un-skip | Partial | P0 |
| 10 | Dose stays under original time | Yes | Moves | Different | P0 |
| 11 | Missed during the day | At the end of the reminder period (30 min after the dose time) | Only on past days | Missing | P1 |
| 12 | Auto-scroll and live clock | Yes | No | Missing | P1 |
| 13 | "Unmarked meds" chip | Yes | No | Missing | P1 |
| 14 | Skip reason list | 7 Medisafe reasons | 5 presets + free text | Different | P1 |
| 15 | Pills left and notes in dialog | Yes | Partly | Partial | P1 |
| 16 | Refill reminder on Android | Daily at a set time | None | Missing | P1 |
| 17 | Undo restores previous state | n/a (Un-take) | Resets to pending | Bug | P1 |
| 18 | Schedule edit keeps history | Edit is from today | Rewrites past days | Bug | P1 |
| 19 | One time format | Device format | Mixed 12 h / 24 h | Inconsistent | P1 |
| 19a | No reminder for a dose already taken | Yes | Follow-ups can fire after travel (day key mismatch); a posted notification stays after an in-app take | Bug | P0 |
| 19b | Daily missed-meds alert | "Did you take your meds today?" | None | Missing | P1 |
| 19c | Reminder repeat | 1 to 10 reminders (owner: interval and reminder period settings) | 1 to 4 (0 to 3 follow-ups) | Different model | P1 |
| 19d | Info and Edit from the dose dialog | Yes | No | Missing | P1 |
| 20 | Different dose per time in Add wizard | Yes | Edit drawer only | Partial | P2 |
| 21 | Every N days, cycles, end date | Yes | No | Missing | P2 |
| 22 | Weekend mode | Android | No | Missing | P2 |
| 23 | Web reminders when the window is closed | n/a | Only while Medications is open | Partial | P2 |
| 24 | Full-screen reminder popup | Optional | No | Missing | P2 |

## 4. Today screen and "Mark all doses" modal

### 4.1 Time format

- Use one time format in all medication surfaces.
- The format follows the device locale (`Intl.DateTimeFormat().resolvedOptions().hour12`).
- Replace the three copies of `formatTime12` with one helper in `lib/medication-ui-utils.ts`.
- Examples below use 24-hour format ("08:30").

### 4.2 Today screen layout

From top to bottom:

1. Week strip (keep `WeekDaySelector`). Add swipe left and right to change the day.
2. Progress line (keep `DoseProgressSummary`). "All done for today!" shows when every dose is taken. "All doses handled" shows when some are skipped.
3. Titration start prompt (keep).
4. **Carried over** group (new, today only, PR 2), titled "Moved to today". It shows doses of other days (earlier or later) that are rescheduled into today. See section 5.6.
5. One card for each slot, in time order.
6. Other doses today (keep `OtherDosesToday`).
7. "+" button (keep `LogDoseFab`).

Behaviour:

- On open, and when the Medications window becomes visible, scroll to the slot nearest to now. Use an offset so the header is visible.
- A clock ticks once a minute (reuse `useNowTick(60_000)`, which `useTodayKey` already uses). Header colour, "Missed" state and the chip update on each tick.
- A floating chip "Unmarked meds" shows when an off-screen slot has open doses that are due. A tap scrolls to the first such slot. If only rescheduled doses are off screen, the chip says "Rescheduled meds".
- Empty state on today: "No meds today!". On another day: "No meds on this day".
- The sys-bar badge counts only doses that are due now (due instant ≤ now, open), not tonight's doses. A rescheduled dose counts from its `remindAt`. A carried-over dose counts.

### 4.3 Slot card

Header:

- Left: the time, for example "08:30", in IBM Plex Mono.
- The time text is in the primary colour when now is within 60 minutes of the slot time (Medisafe ±1 h).
- The time text is in the missed colour when the slot has a missed dose.
- Right: "Mark all doses". It shows when the slot has 2 or more doses. On a future day the modal has only Reschedule (we cannot take or skip a future-day dose; section 4.5).
- For a slot with 1 dose, there is no header button. The row buttons do the work.

Rows (one per dose):

- Pill icon with a status badge: taken (check), skipped (cross), missed (exclamation), rescheduled (clock).
- Line 1: brand name. Use the name that the owner sees on the box (active brand, else generic; the same rule as `ReminderDose.displayName`). The generic name goes in the dialog. Voice matching must still accept the generic name.
- Line 2: "100 mg · 1 tablet · with food". Use "·", never "--".
- Line 3 (status), one of:
  - "Taken at 08:32"
  - "Taken at 08:32, Oct 18" (when the taken date is not the dose date)
  - "Skipped · Forgot / busy / asleep"
  - "Missed"
  - "Rescheduled for 10:00" (primary colour)
  - "Rescheduled for 00:30, tomorrow"
- Right side: a round Take button (check). It changes to a filled check when taken.
- A tap on the row opens the dose dialog for ALL statuses (fixes gap 4).
- A long-press on the Take button opens the time-taken sheet (section 4.6) at once.
- Skip is not on the row. Skip is in the dose dialog and the modal. This matches Medisafe and gives a larger tap target. (The current Skip row button goes away.)
- The Take button is not shown on a future day (the service refuses it).

### 4.4 "Mark all doses" modal

Container:

- A bottom sheet on phone (full height), a centred dialog on desktop. Use the existing drawer component.
- Title: the slot time, "08:30". Subtitle: the date when it is not today, "Sunday, Oct 18".
- Close icon (X) at top right. Back and Esc close it.
- A warning line, when it applies: now is after the late window (section 4.6) and at least one dose is open: "You have not marked these doses. Consider if it is safe to take them now."
- There is no warning before the slot time (owner decision 2). An early Take all records the current time.
- The list of the slot's doses. Each row is the same as the Today row, without the Take button. A tap opens the dose dialog on top of the modal.

Action bar. The owner's buttons are Skip all, Take all, Untake all and Reschedule. Each button has its own rule. "Open" = a dose with no final user action: pending, missed or rescheduled. Taken and skipped are final user actions. A rescheduled dose is still waiting to be taken, so it counts as open.

| Button | Place | Shows when |
|---|---|---|
| Skip all | Left | Today or past day, and at least 1 dose is open |
| Unskip all | Left, in place of Skip all | Today or past day, at least 1 dose is skipped, and no dose is open |
| Take all | Centre (primary) | Today or past day, and at least 1 dose is open |
| Untake all | Centre, in place of Take all, when no dose is open; else a text button above the bar | At least 1 dose is taken |
| Reschedule | Right | At least 1 dose is open |

- "Reschedule" is not shown when no dose is open.
- On a future day, only "Reschedule" shows.
- Until PR 2 ships, "Reschedule" is not shown in the modal (section 7).

Action rules. **A bulk action changes only the open doses. It never changes a taken or skipped dose** (owner decision 8). Example: one 08:30 med is taken at 08:35. At 09:00 the user taps "Take all". That med stays "Taken at 08:35". The other open meds become "Taken at 09:00". (Change from Medisafe: Medisafe's Take All overrides marked doses.)

- **Take all**: takes every open dose. It records the current time ("Take now").
  - Before the write, apply the late-window rule (section 4.6) once for the slot. The sheet opens when ANY open dose is after its late window. Inside the window, or before the dose time, there is no sheet.
  - The chosen time applies to every open dose.
- **Skip all**: skips every open dose. Then the skip reason sheet opens (section 4.7). The reason goes on all of them.
- **Untake all**: untakes every taken dose. Stock goes back. (This reverses a user action, so it acts on taken doses by design.)
- **Unskip all**: every skipped dose goes back to open. The reason is cleared.
- **Reschedule**: opens the reschedule sheet (section 5.4) for every open dose.
- To change a taken or skipped dose, the user opens its dose dialog.
- Because no bulk action overrides a marked dose, there is no mixed-slot confirmation and no `bulkOverrideConfirm` setting.

Result:

- An overlay in the sheet says "3 meds taken" (or "skipped", "untaken", "rescheduled for 10:00"). The count is only the doses that changed. The rows show the new status. The modal closes after 1 second.
- The Today screen then shows an Undo toast for 5 seconds. Undo restores the EXACT previous state of each changed dose (status, taken time, skip reason, reschedule). Stock follows the status: undo of "Take all" refunds the pills; undo of "Untake all" debits them again. This fixes gap 17.
- Keep the current stale check: undo touches a log only while it is still exactly as the action left it (`useRevertDoseActions`).

Write rules:

- One bulk action is one `syncedWrite` call that covers every dose. `syncedWrite` joins an open transaction, so the per-dose helpers run inside it. Do not call `db.transaction` directly: it would skip the sync queue. All doses change or none change.
- `takeDose` on a dose that is already taken is a no-op (it must not rewrite `actionTimestamp`). Only "Change time" (`editDoseTime`) rewrites a taken time.
- Delete the duplicate bulk code in `hooks/use-medication-queries.ts`. Use the service functions in `lib/dose-log-service.ts` only.
- On failure, show "Could not save. No dose changed." and keep the modal open.

### 4.5 Dose dialog

- Opens from any row, any status, any day.
- Header: brand and strength, generic name under it. Toolbar icons: Info (opens `about-medicine-view.tsx`) and Edit (opens the edit drawer for the med). There is no Delete (section 1.4).
- Status line, as in section 4.3.
- Warning, as in section 4.4, for a single dose: only after the late window. There is no early warning.
- Body: "Scheduled for 08:30, Monday, Oct 19". Dose text. Food instruction. Note. "N pills left" (from the active brand). "Last taken at 08:31, yesterday".
- Action bar:

| Dose state | Left | Centre | Right |
|---|---|---|---|
| Open (pending, rescheduled, missed) | Skip | Take | Reschedule |
| Taken | (none) | Untake | (none) |
| Skipped | Unskip | Take | Reschedule |
| Future day | (none) | (none) | Reschedule |

- A missed dose can still be taken, skipped or rescheduled (owner decision 5).
- On a future day, there is no Take or Skip. Change from Medisafe: Medisafe lets you take a future dose with a warning. **This guard is kept on purpose** (owner decision 7 allows it only where correctness depends on it). The plan depends on it: stock is debited at the take, so a take of a future-day dose debits a pill that is still in the bottle, and the dose key (`scheduleId`, `scheduledDate`) of a future day is not due yet. A dose of today can be taken at any time, also before its dose time. The day is the one of the dose's due instant: a later day's dose rescheduled into today (or earlier) counts as today's and can be taken or skipped (section 5.6).
- When rescheduled, the dialog also shows a text button "Cancel reschedule" (section 5.5).
- Take uses the late-window rule (section 4.6). Long-press on Take opens the time-taken sheet.
- Skip opens the skip reason sheet.
- To change a taken time: "Untake", then long-press "Take". A shortcut "Change time" on a taken dose opens the time-taken sheet and rewrites the time. (This keeps our current Edit feature with Medisafe words.)
- All actions catch errors and show a toast.
- The dialog reads the live dose from the query, not a frozen snapshot.

### 4.6 Time-taken sheet ("When did you take your meds?")

Setting:

- Name: "Late window". Help text: "Ask for the time taken when you take a dose later than this." Place: Settings, Medications, "Time & reminders".
- Values: 15, 30, 40, 45, 60, 90, 120 minutes, "Always ask", "Never ask". Default: **40 minutes** (owner decision 3).
- Store: synced setting `lateWindowMinutes` (integer; `0` = Always ask, `-1` = Never ask). Do not use `null` for Never: a null column and a missing localStorage value would read the same. It is a new `user_settings` column, so PR 1 has a migration.
- One pure function `needsTakenTimePrompt(dueInstant, now, lateWindow)` in `packages/core` decides it. Row, modal, dialog, voice and notification use it. Delete the two hard-coded 30-minute values.

Rule (owner decisions 2, 3 and 4):

- The prompt opens only when `now − due > lateWindow`. It never opens for an early tap.
- Example with the default: an 08:30 dose.
  - Take at 07:30 records 07:30. There is no prompt.
  - Take at any time from 08:30 to 09:10 records the current time. There is no prompt.
  - Take after 09:10 opens the sheet.
- A past-day dose is always after its late window, so the prompt opens. A carried-over dose (section 5.6) follows the same instant rule. No special case is needed.
- `due` is an instant, not "HH:MM". Compare instants, never minutes of the day (the current `isLateDose` compares minutes of the day and fails across midnight).
- Without the prompt, Take records "now" and shows the Undo toast.
- For a rescheduled dose, `due` is `remindAt`. A dose rescheduled to 10:00 and taken at 10:05 records "now" with no prompt.
- A late take never moves a later dose. The 20:00 dose stays at 20:00.

Sheet:

- Title: "When did you take your meds?" (single dose: "When did you take Brand?").
- Option 1: "Take now (10:12)". It records now.
- Option 2: "Take at a specific time". It opens a time picker and a date picker. The default value is the due time. The user confirms with "Save". There is no time limit (owner decision 7). A picked time after now shows a warning "This time is in the future", but Save is still allowed. A wall time that does not exist (DST spring-forward) resolves to the shifted instant, the same rule as `zonedTimeToEpoch`.
- Option 3: "Skip". It skips the dose (or every open dose, from Take all) and opens the skip reason sheet (section 4.7).
- Cancel closes the sheet. Nothing is written.
- Options 1 and 3 are one tap.
- Long-press on Take opens this sheet at once, also inside the late window. This is how the user records a specific time for a dose that is not late.

Data:

- The sheet returns a full instant (epoch ms), not "HH:MM". `takeDose` takes `takenAt: number`. This removes the 12-hour next-day guess in `resolveTakenAt` (fixes the midnight bug).

### 4.7 Skip reason sheet

- Title: "Why are you skipping this dose?"
- Options, in this order (Medisafe list, in our words):
  1. "Med is not near me"
  2. "Forgot / busy / asleep"
  3. "Ran out of the med"
  4. "Do not need this dose"
  5. "Side effects / health concerns"
  6. "Cost"
  7. "Doctor advised" (we keep this one from our current list)
  8. "Other" (opens a text box)
- "Ran out of the med" is highlighted with the current rule (keep): stock is less than one dose (`negative_stock`), or there is no stock item.
- The sheet can be dismissed. The dose is then skipped with no reason. This matches Medisafe build 20880. It changes our current behaviour, where dismiss cancels the skip. So the skip is written first, and the Undo toast shows at once, before the sheet.
- Old logs keep their old reason text ("Forgot", "Ran out"). History shows the stored text as it is. No data migration.
- A switch "Ask me every time" (synced setting, default ON). When OFF, skip writes no reason and the sheet does not open.

### 4.8 Voice

- Voice review shows the time-taken choice when no time is spoken and the late-window rule applies (section 4.6). The three options are the same as section 4.6. The owner must pick one before save. An early or in-window voice take records the current time with no choice.
- A spoken time ("I took them at half eight") skips the choice. There is no limit on the spoken time.
- A voice bulk take follows the bulk rule of section 4.4. "Log all my remaining 08:30 meds as taken at 09:00" takes only the open 08:30 doses. A dose that is already taken or skipped stays as it is.
- Voice does not reschedule in this plan.

## 5. Rescheduling design

### 5.1 Decision

- **Reschedule moves ONE occurrence of a dose (or all doses of one slot) to a new instant. It never changes the regular schedule.**
- **The dose stays under its ORIGINAL time on the Today screen. The row says "Rescheduled for 10:00". The reminder fires at the new time.** This is Medisafe behaviour (owner decision 9).
- A change "from now on" is a schedule edit, not a reschedule. It uses the edit drawer with an effective date (section 5.10).
- We do not shift later doses. Medisafe does not do it, and the owner does not want it (owner decision 4).

Reasons:

- The dose identity is (`scheduleId`, `scheduledDate`). Keeping the row under its original time keeps that identity visible. It also keeps the slot modal complete.
- Our current "move the row" approach breaks the slot group, puts a 00:30 dose at the top of the day, and makes "next slot" wrong.
- An absolute instant removes the DST, travel and midnight bugs of `rescheduledTo: "HH:MM"`.

### 5.2 Data written

Add one field to `DoseLog` (`packages/types/src/records.ts`):

```ts
/** Epoch ms. The reminder instant after a reschedule or snooze. */
remindAt?: number;
```

- Add the column `remindAt: bigint("remind_at", { mode: "number" })` to `dose_logs` in `packages/db/src/schema.ts`. Run `pnpm db:generate`. The date is after 2026-05-31, so do NOT edit `packages/db/migrations/meta/_journal.json`.
- Add `remind_at` to the CSV export (`lib/export-service.ts`, next to `rescheduled_to`). The backup schema uses `.passthrough()`, so it needs no change; add a round-trip test.
- Dexie needs no new version. The field is not indexed.
- `status` stays `"rescheduled"` while the dose is open and `remindAt` is set.
- **`remindAt` counts only while `status` is "rescheduled".** For any other status it is history. Every reader uses one helper `dueInstant(log, scheduledInstant)` = `status === "rescheduled" && remindAt != null ? remindAt : scheduledInstant`.
- Stop writing `rescheduledTo`. On read, a legacy log with `rescheduledTo` and no `remindAt` is converted only when its `scheduledDate` is today or later: `remindAt = instant(scheduledDate, rescheduledTo, log.timezone)`; if that instant is before the scheduled instant, add 1 day (the old picker had no date). A past legacy log is ignored and follows the past-day rule.
- `actionTimestamp` keeps its meaning: the instant of the action (taken time for a taken dose).

Write per action:

| Action | status | remindAt | Other |
|---|---|---|---|
| Reschedule | rescheduled | new instant | skipReason cleared |
| Snooze (notification) | rescheduled | now + snooze minutes | same as reschedule |
| Cancel reschedule | pending | null | |
| Take | taken | kept (history) | actionTimestamp = taken instant, stock debit. On a dose already taken: no write. |
| Untake | rescheduled if remindAt > now, else pending | kept | stock refund |
| Skip | skipped | kept | skipReason |
| Unskip | rescheduled if remindAt > now, else pending | kept | skipReason cleared |

- Untake after a reschedule: when `remindAt` is still in the future, the dose goes back to "Rescheduled for 10:00" and its reminder is armed again. When `remindAt` is past, the dose goes to pending, `dueInstant` is the original time, and the missed rule (section 5.8) applies. This matches Medisafe un-take ("pending if the time is in the future, else missed").
- Reschedule is refused on a taken dose. The UI hides it. The service throws "Untake the dose first." This removes the silent un-take.
- Reschedule twice: the new `remindAt` replaces the old one. Undo of the second reschedule restores the first `remindAt`.

### 5.3 Validation

- **There is no time limit** (owner decision 7). A dose or a slot can be rescheduled to any date and time. This matches Medisafe (no stated limit). The old 2-minute minimum and the 24-hour maximum are removed.
- Warnings, not errors. Save is always allowed:
  - When the new instant is at or after the NEXT scheduled dose of the same med (for example the 20:30 dose): "This is after your next Brand dose at 20:30." This guards against a double dose without blocking a real need.
  - When the new instant is not after now: "This time has passed. Its first reminder may not fire." A reminder never fires late, so only the repeats still to come fire. When the reminder period after the new instant has also ended: "This time has passed. The dose shows as missed."
  - The next-dose warning names the day when that dose is not today: "This is after your next Brand dose at 08:30, tomorrow."
- Reschedule is allowed for any open dose on any day. A carried-over dose (section 5.6) can be rescheduled again.
- The only hard rule is the one in section 5.2: a taken dose cannot be rescheduled. Untake it first. Any day is allowed, also a day before the dose's own day (owner decision 7): tomorrow's 08:30 dose moved to today 20:00 shows in "Moved to today" and can be taken today (section 5.6).
- The service and the UI use the same warning function, so the user sees the warning before save.

### 5.4 Reschedule sheet

- Title: "Reschedule for".
- Quick picks (one tap each): "+15 min", "+30 min", "+1 hour", "+2 hours". A pick saves at once. When the picked time has a warning (section 5.3), the pick only fills in the fields and shows the warning; the user then taps "Reschedule". On today, each pick is relative to now. On a future day, each pick is relative to the scheduled time.
- A time picker and a date picker. Quick days "Today" and "Tomorrow" are one tap; the date picker allows any date.
- Default value: the current `remindAt` if it is still in the future, else now + 30 minutes (today) or the scheduled time + 30 minutes (future day).
- A picked wall time that does not exist because of DST resolves to the shifted instant (`zonedTimeToEpoch` rule). The sheet shows the resolved time.
- Buttons: "Reschedule" and "Cancel".
- Result toast: "Brand rescheduled for 10:00" or "3 meds rescheduled for 10:00". The toast has Undo.

### 5.5 How it shows

- The row stays under the original slot header.
- Pill badge: clock. Status line: "Rescheduled for 10:00" in the primary colour.
- The slot header time stays at the original time. The header is not "missed" while any dose in it has `remindAt` in the future.
- The dose dialog shows "Scheduled for 08:30" and "Rescheduled for 10:00". It has "Cancel reschedule".
- The floating chip says "Rescheduled meds" when only rescheduled doses are off screen.
- Progress counts a rescheduled dose as open.

### 5.6 Midnight

- A 22:00 dose rescheduled to 00:30 keeps `scheduledDate` = the original day.
- On the original day, it shows under 22:00 with "Rescheduled for 00:30, tomorrow".
- On the day of `remindAt`, it ALSO shows in the "Carried over" group at the top of today until it is taken, skipped or missed. There is no reschedule limit (section 5.3), so the dose can come from any other day, earlier or later (tomorrow's 08:30 dose moved to today 20:00). The group title is "Moved to today". Each row shows its original day and time, for example "From Sunday, Oct 18, 22:00". The row is the same dose (same log). An action on it writes the same log.
- A later day's dose moved into today can be taken or skipped today: the future-day guard (section 4.5) looks at the due instant, so a rescheduled dose whose `remindAt` is on or before the end of today counts as today's. A future-day dose with no reschedule is still refused. On its own day the dose still shows under 08:30, with "Rescheduled for 20:00" and the day ("today", "Oct 20"), or "Taken" once taken.
- Take on it records the full instant from the time-taken sheet or now. There is no "HH:MM" guess.
- The missed rule (section 5.8) uses `remindAt`, not the calendar day. So the dose does not turn missed at midnight.
- Past-day rule from the 2026-09 audit stays: a dose with no log on a past day is missed. A rescheduled dose whose reminder period after `remindAt` has not ended is the only exception. This exception goes into `resolveDoseStatus` too (it gets an optional `remindAt` and `now`), so analytics, export and MCP do not count the carried-over dose as missed.
- `getDailyDoseSchedule(today)` adds one read for the group: logs with status "rescheduled", `scheduledDate` on any other day (before or after today), and `remindAt` on today, or `remindAt` before today while its reminder period reaches into today (a dose moved to 23:50 still waits, and its reminders still fire, at 00:05). The set is small. Use an existing index if one fits. Else add a Dexie version with an index on `status` (repeat all store definitions). The sys-bar badge and the notification tap use the same list.
- After midnight, the week strip on yesterday still shows the dose under 22:00 with "Rescheduled for 00:30, today".
- Voice: "I took my 22:00 meds" after midnight already picks the previous day (12-hour rule in `voice-medication.ts`). Keep that test green.

### 5.7 Time zone and DST

- `remindAt` is absolute (epoch ms). It does not change with DST or travel.
- The UI shows it in the device zone.
- The original slot time keeps its current rule (anchor time zone, `resolveScheduleLocalTime`).
- Travel: a pending reschedule keeps its absolute instant when the user picks "Keep times" or "Change to new time zone" in `timezone-change-dialog.tsx`. Only the regular schedule moves. Rows then show the instant in the new device zone.
- One dose key everywhere. Today keys a dose by the device date; the reminder builder keys it by the anchor-zone date (section 2.6). PR 3 must make both use one function in `packages/core` that maps (schedule, instant) to the `scheduledDate` that the Today screen writes. Test: anchor Europe/Berlin, device Asia/Tokyo, a 20:30 dose taken in the app gets no follow-up.

### 5.8 Missed status

Owner decision 5: Missed is an automatic state.

- Only a user action sets Taken or Skipped. The app never sets them.
- A dose with no user action (taken, skipped or rescheduled) at the end of the reminder period becomes **Missed**.
- Missed shows on the same day, as soon as the period ends. It does not wait for the next day (fixes gap 11).
- A missed dose stays Missed until the user changes it. The user can still take it, skip it or reschedule it later.
- A reschedule (or a snooze) is a user action. It restarts the period from `remindAt`. If the dose is still not taken or skipped at the end of that new period, it becomes Missed. This matches Medisafe ("Rescheduling restarts the missed-dose timer").

Rule:

- `dueAt = dueInstant(log, scheduledInstant)` (section 5.2).
- `periodEnd = dueAt + reminderPeriodMinutes` (setting, default 30; section 6.6).
- A dose is **missed** when it is open and now > `periodEnd`.
- Example with the defaults: an 08:30 dose gets reminders at 08:30, 08:40, 08:50 and 09:00. With no action, it is Missed after 09:00.
- The late window (40 minutes) is longer than the reminder period (30 minutes). So a dose that is Missed at 09:05 is still inside its late window: Take records 09:05 with no prompt. This is correct. The two settings are independent.
- Missed is derived from time, not written to the log. Time only moves forward, so a missed dose stays missed until a user action writes the log. A change to "Reminder period" re-computes the state of today's open doses with the new value. This is an accepted edge case.
- Put the rule in a new pure function `resolveLiveDoseStatus(log, scheduledInstant, now, reminderPeriodMinutes)` in `packages/core`. The Today screen, the badge, the chip and the reminder content use it. Keep `resolveDoseStatus` (calendar-day rule plus the carried-over exception from section 5.6) for analytics, export, MCP and insights. Reason: the MCP queries run on the server, and adherence history must not change with a device setting.

### 5.9 Reminders after a reschedule

- `isSlotHandled` returns true only for taken and skipped. "rescheduled" is NOT handled.
- The shared reminder builder (`lib/medication-reminder-builder.ts`) emits an occurrence at `remindAt` instead of the scheduled instant for that dose.
- Repeat reminders count from `remindAt`, through the reminder period (section 6.6).
- In a slot, rescheduled doses form their own reminder group at `remindAt` (section 6.4).
- Push server (`lib/push-db.ts`): the server is dormant (section 6.2), but it must not be wrong. It sends only at the weekly slot times (`push_schedules`), so it cannot send at `remindAt`. The handled list is taken, skipped, and rescheduled with a `remind_at`: a moved dose gets no push at its old time. Known limit while the server is dormant: no server push fires at `remindAt`; the device's local reminders do.
- A reschedule or snooze of a dose whose notification is on screen removes the dose from that notification (section 6.3, "Posted notifications").

### 5.10 "From now on" schedule change

- This is the Medisafe "edit the med" path.
- The edit drawer Schedule tab asks "Apply from" with a date. The default is today.
- Save closes the old `PhaseSchedule` rows at that date and creates new rows from that date. Past days keep the old time, dose and weekdays.
- This fixes the history rewrite in `updateSchedule`.
- Data: today `scheduleLiveOn` dates a row by `createdAt` and `deletedAt` (the write time). A chosen "Apply from" date cannot be stored in those fields. So this needs new fields (`effectiveFrom`, `effectiveTo`, date keys) on `PhaseSchedule`, a Drizzle migration, and a change to `scheduleLiveOn` and the reminder builder.
- Logs on the change day: a dose log is keyed by `scheduleId`. When "Apply from" is today and today's 08:30 dose is already taken under the OLD row, the new row would show today's dose as open again. Rule: the new row starts tomorrow when the old row has a log today, or the old row's log for that day is moved to the new `scheduleId` in the same write. Test both.
- This is a med-edit workflow, not a reschedule. It is its own PR (PR 2b), not part of PR 2.
- **Built (PR 2b).** Fields: `effectiveFrom` (inclusive) and `effectiveTo` (exclusive), device-local date keys, the same key as `scheduledDate`. A row without them keeps its `createdAt`/`deletedAt` dating, so the owner's data needs no migration. The pure rules are in `packages/core/src/schedule-window.ts` (`scheduleInEffectOn`, `planScheduleChange`). Readers: Today screen (`scheduleLiveOn` and today/future), reminder builder, MCP (`loadEffectiveRegimen` takes the day), analytics snapshot, refill math, and the edit drawers (newest rows, plus "A change starts …").
- **Change-day rule: "start next day" is the product rule.** When a row that changes has a logged dose (taken, skipped or rescheduled) on the change day or later, the whole change (every new, closed and removed row of the phase) starts the day after the last such logged dose. One day for the whole regimen, so no new dose is added on top of a dose already taken. A row that does not change does not hold the change back. The toast says "Today's dose is already logged. The change starts tomorrow." Reason: the dose identity is (`scheduleId`, `scheduledDate`). Moving a log to the new row changes the identity of a logged dose, puts a dose taken at 08:35 under a 20:00 slot, and is history rewrite, which this change exists to stop. Medisafe also keeps a dose taken before an edit as it was. The "move logs" rule is built behind `changeDayRule: "move-logs"` and tested, so the owner can switch.
- **Later edits.** A unit change is a change of every row (a closed row keeps its unit, stamped the first time it closes). Re-saving the schedule a drawer shows writes nothing, so a pending change keeps its date (the edit drawer sends the schedule only when the rows, the unit or the date changed, and starts the date at the newest pending change; the titration drawer leaves an entry the user did not change alone). The drawer lists every pending change, also one that only removes a time.
- **Past "Apply from" dates are not allowed** (UI minimum and service check, "Pick today or a later date."). A past date would rewrite days that already have logs. Owner to decide if a past date is wanted.
- A running titration phase uses the same rules ("Apply from" in the titration drawer while the plan runs). A phase that has not started is edited in place.

### 5.11 Undo

- Every reschedule toast has Undo. Undo restores the previous log fields exactly (status, remindAt, skipReason). Undo also re-arms or cancels the reminder through the normal resync.
- "Cancel reschedule" is the long-term undo in the dialog.

## 6. Reminders design

### 6.1 What is possible

| Channel | Works in background | Can act without opening the app | Notes |
|---|---|---|---|
| Capacitor `@capacitor/local-notifications` 8.3.1 | Yes, alarms survive reboot | No. Actions use `PendingIntent.getActivity`, so they open the app | Data lives in WebView IndexedDB |
| Own Capacitor plugin (Kotlin) with `AlarmManager` + `BroadcastReceiver` | Yes | Yes. A receiver handles the action with no UI | Must queue the action and replay it into Dexie |
| PWA web push + service worker | Only with a server trigger | Yes, `notificationclick` with `event.action` can write to IndexedDB | Needs a per-minute trigger. Vercel Hobby has only daily cron. GitHub cron runs every 2 to 5 hours |
| In-page notifier | No | n/a | Does not work in the Android WebView |

Constraints:

- The phone holds the data. The server knows dose state only after a sync.
- On Android, alarms on the device need no server and no network. They are the only reliable option for an offline-first app.
- Exact alarms need `SCHEDULE_EXACT_ALARM`. On Android 14 it is not granted by default. The user grants it once in system settings. The user (or the system) can revoke it; the app must listen for `ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED` and re-arm.
- Option: `USE_EXACT_ALARM` (API 33+) is granted at install with no user step. Google Play allows it only for alarm-clock and calendar apps, so it is a risk for the dormant Play pipeline. The APK is installed through Obtainium now. Owner decision 10: use `SCHEDULE_EXACT_ALARM` with a one-time screen and the settings row (section 6.2). Do not use `USE_EXACT_ALARM`.
- In Doze, `setExactAndAllowWhileIdle` alarms are rate-limited (about one per 9 to 15 minutes per app). Two slots or a slot and its follow-up close together can be late. `setAlarmClock` is not rate-limited, but it shows an alarm icon in the status bar. Decide with the on-device Doze test in PR 3 (`adb shell dumpsys deviceidle force-idle`).
- OEM battery savers can kill alarms. The status row shows whether battery optimisation is off for the app, with a link to the system page.
- `POST_NOTIFICATIONS` is a runtime permission on Android 13+. Denied means no reminders; the status row says so.

### 6.2 Decision

- **Android: a small own Capacitor plugin `DoseAlarms` in `apps/native/android/app`.** It replaces `@capacitor/local-notifications` for dose and refill reminders. The native project is Java only today. Kotlin needs the Kotlin Gradle plugin; Java is also fine. A local plugin is registered in `MainActivity` (`registerPlugin`), not in `includePlugins`.
- **Lock-screen actions without opening the app** come from this plugin (owner decision 10).
- **Exact alarms:** the app uses `SCHEDULE_EXACT_ALARM`. A one-time screen asks the user to allow exact alarms. It shows on the first open after the update when the permission is off. Text: "Allow exact reminder times. Without this, Android can send your reminders late." Buttons: "Allow" (opens the system exact-alarm page) and "Not now". It does not show again after either button. The settings row "Exact reminder times" (section 6.9) stays for later changes.
- **Upgrade step:** on the first run of the new build, cancel EVERY pending notification of `@capacitor/local-notifications` (up to 400, 30 days ahead). Else the old per-medicine alarms fire next to the new slot alarms. Then remove the plugin from `includePlugins` and `package.json`.
- **Web (desktop and PWA): keep the in-page notifier, but run it from the app shell, not only the Medications window.** It is a secondary channel (PR 5, P2).
- **Server push: stays dormant.** Do not add a paid scheduler. Remove the GitHub cron workflow, or keep it disabled with a comment. The code stays, with its tests, and with the handled-status fix from section 5.9.

Reasons:

- The owner uses Android. Medisafe-level reminders need actions that work without opening the app. Only native code can do that.
- The plugin is small: schedule, cancel, post, handle action, keep a queue. It has no business logic. The web layer stays the source of truth for what is due.

### 6.3 Plugin design

Web to native (called from `lib/local-notifications.ts`, renamed `lib/dose-alarms.ts`):

- `sync(alarms: SlotAlarm[], options)`: replaces the full set. Each `SlotAlarm` has `id`, `fireAt` (epoch ms), `slotKey` (`due|<epoch>`: one key per due instant), `title`, `lines[]`, `doseRefs[]` (`scheduleId|scheduledDate`, the same key as the Today screen, section 5.7), `followUpIndex`, `scheduledAt`, `lateAt` (or none for "Never"), `kind` (`dose` or `refill`). `options` has `snoozeMinutes`, `reminderIntervalMinutes`, `reminderPeriodMinutes` and `lateWindowMinutes`, so the receiver can snooze, re-arm the repeats and compute late actions with no web code.
- `peekActions(): QueuedAction[]` and `ackActions(ids)`: the web layer reads the queue, writes to Dexie, and acks only after the write commits. A crash between the two replays the action again, and replay is idempotent (below). (A single "drain and clear" call would lose an action on a crash.)
- `getStatus()`: notification permission, exact-alarm permission, channel state.
- `openExactAlarmSettings()`, `openChannelSettings()`.

Native behaviour:

- `AlarmManager.setExactAndAllowWhileIdle` when exact alarms are granted. Else `setAndAllowWhileIdle` (inexact). See the Doze note in section 6.1.
- A boot receiver re-arms the stored set (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`). The exact-alarm permission receiver also re-arms. A time or zone change needs no re-arm: every alarm is an absolute instant. The web layer moves the regular schedule only after the user answers the time zone dialog.
- The alarm receiver posts the notification.
- Channel "Dose reminders": `IMPORTANCE_HIGH`, default sound, vibration on. Channel "Refill reminders": `IMPORTANCE_DEFAULT`.
- Lock screen: `VISIBILITY_PRIVATE`. The public version shows only "Time for your 08:30 meds". Med names show when the phone is unlocked. This matches Medisafe's "names hidden" default.
- A monochrome PNG small icon (add one; SVG does not render well).
- Tap on the body opens the app with an intent extra `doseRefs` and `dueAt`. The PendingIntent must start the activity directly (Android 12+ blocks a receiver that starts an activity, the "trampoline" rule). The web layer opens the Medications window and the "Mark all doses" modal for exactly those doses, with the due time as the title. (A notification can hold doses from two original slots, for example an 08:30 dose rescheduled to 12:00 next to the 12:00 slot. So the modal takes a list of doses, not only a slot.) Earlier open doses show through the "Unmarked meds" chip, like Medisafe's chips for missed slots.

Action receiver (no UI):

- Actions work from the lock screen with no unlock (`setAuthenticationRequired(false)` on API 31+), like Medisafe.
- Writes a `QueuedAction` (`id`, `action`, `doseRefs`, `at` = tap instant, `takenAt`) to SharedPreferences.
- Cancels the follow-ups and the late re-post for those doses at once.
- For Snooze: arms a new alarm at now + `snoozeMinutes`, with the same lines.
- Removes the notification.

Web replay:

- On app start and on every resume, the web layer replays the queue BEFORE it renders the Today data AND before any alarm sync. The resync must wait for the replay; else a resync on resume re-arms the follow-ups that the receiver cancelled.
- Each action calls the normal service functions (`takeDose`, `skipDose`, `rescheduleDose`) with the queued instants. The writes then sync as usual.
- Idempotent and ordered:
  - A replayed Take on a dose that is already taken does nothing. It must not rewrite the taken time (section 4.4 write rules).
  - A queued action is dropped when the dose log has `updatedAt` after the action's `at` (a later change in the app, or a sync from another device, wins).
  - Two queued actions for the same dose replay in `at` order.
- The Today screen shows a toast "3 meds taken from the reminder" with Undo.

Posted notifications:

- When a dose is taken, skipped or rescheduled in the app (or by voice), the resync also updates a notification that is ON SCREEN: it removes the dose from it, or removes the notification when no dose is left. Cancelling only the pending alarms is not enough.
- Known limit (offline-first): when a dose is taken on another device, the phone does not know until it syncs. Its alarms can still fire. A tap on "Take all" then replays as a no-op for that dose. There is no server push to cancel them (section 6.2).

### 6.4 Notification content and grouping

- One notification per due instant. All open doses with the same due instant form one notification, also when some are rescheduled into it.
- Title: "Time for your 08:30 meds" (follow-up: "Reminder: your 08:30 meds"; rescheduled: "Time for your rescheduled meds").
- Style: `InboxStyle`. One line per open dose: "Brand 100 mg · 1 tablet · with food". Taken or skipped doses in the slot are not listed.
- Summary text: "3 meds · 12 pills left of Brand" when a med is low. Else nothing.
- Single-dose slot: the title is "Time for Brand", and the body is the dose line.

### 6.5 Actions

All actions act only on the open doses of the notification (section 4.4 bulk rule). A dose taken or skipped in the app is already removed from the notification (section 6.3).

Inside the late window:

- "Take all" (single dose: "Take"). Records `takenAt` = tap instant.
- "Snooze". Snoozes for the snooze setting.
- "Skip all" (single dose: "Skip"). Skips with no reason. The app asks for the reason on next open only if "Ask me every time" is ON.

After the late window:

- At `lateAt` = due instant + late window, the plugin re-posts the notification silently (`setOnlyAlertOnce`) with new actions, but only if the notification is still on screen. ("Always ask": the late actions show from the start. "Never ask": there is no `lateAt`.)
  - "Take now" (records the tap instant)
  - "Specific time" (opens the app at the time-taken sheet, option "Take at a specific time"; this needs an unlock)
  - "Skip"
- These are the owner's three late options (section 4.6). So a late tap never records a wrong time.
- Example with the defaults: reminders for an 08:30 dose fire at 08:30, 08:40, 08:50 and 09:00. The late actions replace the normal actions at 09:10.

### 6.6 Snooze and repeat

- Setting "Snooze for": 5, 10, 15, 30, 60, 90, 120 minutes. Default 10. Synced.
- Snooze writes the same data as a reschedule (status rescheduled, `remindAt` = now + snooze). The row then shows "Rescheduled for 08:50". (Medisafe uses one status for both.)
Repeat (owner decision 6):

- The first reminder fires at the dose time (08:30). Reminders NEVER fire before the dose time.
- Then one reminder fires every interval until the reminder period ends.
- Two settings:
  - "Remind me every" (interval): 5, 10, 15, 20, 30 minutes. Default **10**. This is the current synced setting `reminderFollowUpInterval`, renamed in the UI.
  - "Reminder period": 10, 15, 20, 30, 45, 60, 90, 120 minutes. Default **30** (Medisafe default). New synced setting `reminderPeriodMinutes` (a new `user_settings` column, migration in PR 1).
- Reminders fire at `dueAt + k × interval` for every k ≥ 0 where `k × interval ≤ period`. With the defaults: 08:30, 08:40, 08:50, 09:00.
- After the last reminder, no more reminders fire. When the period ends, the dose is Missed (section 5.8).
- When the interval is longer than the period, only the first reminder fires.
- `reminderFollowUpCount` is no longer read. The count comes from the interval and the period. Keep the column for old clients; do not delete it in this plan.
- The new period column gets the default 30 for the owner. The PR notes that he can change it in Settings.
- Repeats grow the alarm count. With per-slot grouping it is far smaller than today's per-medicine count, but keep the 400 cap and the rule "main reminders win over repeats".
- Repeats fire only while a dose in the slot is open. Each repeat lists only the open doses.

### 6.7 Refill alerts

- The web layer computes, for each active brand, the date when stock reaches the alert threshold. It uses current stock and the schedule (`lib/refill-status.ts`, extended with a projection).
- It arms one refill alarm at "Refill reminder time" on that date. Then one each day until a refill is logged or stock rises above the threshold. The web layer books these daily alarms through the 30-day horizon, so they still fire when the app is not opened.
- Setting "Refill reminder time": default 09:00. Synced.
- Content: title "Refill Brand soon", body "12 pills left · about 6 days". Action "Log refill" opens the stock tab of that brand.
- Use one low-stock rule everywhere (`computeRefillStatus`). Remove the direct `refillAlertPills` checks so badges agree (one is in `schedule-view.tsx`, `lowStockWarnings`).

### 6.7a Daily missed-meds alert

- Medisafe has "Did you take your meds today?" and a daily missed-meds alert [APK] (gap 19b).
- Setting "Missed meds alert": off by default, with a time (default 21:00; Medisafe's default is unconfirmed). Synced.
- At that time, if any dose of the day is missed or open and due, post one notification "You have 2 unmarked meds today". Tap opens Today at the first such slot. No actions.
- The web layer arms it with the other alarms. It is cancelled by resync when every due dose is marked.

### 6.8 Horizon and limits

- Keep the rolling 30-day horizon for main reminders and 7 days for follow-ups. Keep the 400 cap.
- Resync on every data change (keep `medication-notification-resync.ts`) and on resume.

### 6.9 Settings (Settings, Medications, "Time & reminders")

- "Dose reminders" (on/off, per device). Keep.
- "Remind me every": interval, default 10 minutes (section 6.6).
- "Reminder period": default 30 minutes (section 6.6). The help text gives the example "08:30, 08:40, 08:50, 09:00".
- "Snooze for": default 10 minutes.
- "Late window": default 40 minutes (section 4.6).
- "Ask me every time" (skip reason): default ON (section 4.7).
- "Refill reminder time": default 09:00.
- "Exact reminder times": shows "On" or "Off — Turn on". "Turn on" opens the system exact-alarm page. The one-time screen in section 6.2 asks for the same permission.
- "Notifications allowed" and "Battery optimisation off": each shows "On" or "Off — Turn on" and opens the system page.
- "Missed meds alert" (section 6.7a).
- "Notification sound and Do Not Disturb": opens the channel settings. The owner can allow the channel to override Do Not Disturb there.
- "Send a test reminder": posts a sample slot notification with actions.

### 6.10 Web channel (PR 5)

- Move `useMedicationNotifications` to the app shell. It runs whenever the app is open.
- One notification per slot (keep). No actions on web in this plan.
- Use the same builder, the same handled rule and the same `remindAt` logic.

## 7. PR plan

Rules: one PR per module. Each PR has its unit tests, DOM tests and e2e tests. Few pushes: push when the PR is complete and locally green. Open each PR ready for review. Wait for CodeRabbit on the last commit. Drive the running app with Playwright before opening the PR. Open one PR at a time (each open PR takes a Neon branch). EVERY PR in this plan needs a new APK release to reach the phone, because the APK bundles the web export (section 2.6).

Order: PR 1, PR 2, PR 2b, PR 3, PR 4, then PR 5 (P2). Each PR leaves the app usable: no button shows before its action works.

### PR 1: Today screen, Mark all doses modal and time-taken rule

Scope:

- `packages/core`: `needsTakenTimePrompt` (late window only, no early prompt), slot-state function (which buttons show), `resolveLiveDoseStatus` (section 5.8 without `remindAt`), bulk target function (open doses only).
- `dose-log-service.ts`: `takeDose` takes an instant with no time limit (the future-day refusal stays, section 4.5); take on a taken dose is a no-op; atomic bulk functions in one `syncedWrite` (take, skip, untake, unskip) that change only open doses (take, skip) or only taken or skipped doses (untake, unskip); undo restores the previous state and stock of each changed dose; `unskipDose`.
- Remove bulk copies in `use-medication-queries.ts`.
- Synced settings: `lateWindowMinutes` (default 40), `reminderPeriodMinutes` (default 30), `askSkipReason` (default ON). These are new `user_settings` columns: Drizzle migration, `SYNCED_SETTING_KEYS`, schema parity. `reminderFollowUpInterval` (default 10) is kept and renamed "Remind me every" in the UI. There is no `bulkOverrideConfirm`.
- The current reminder builder derives its follow-up count from the interval and the period (section 6.6), so the missed rule and the current reminders agree before PR 3.
- UI: time format helper; slot card; row (tap opens dialog for all states; Take button; long-press); "Mark all doses" modal (Skip all, Take all, Untake all) WITHOUT Reschedule; dose dialog rework (Info and Edit icons; keep the old Reschedule there until PR 2 replaces it); time-taken sheet (Take now, Take at a specific time, Skip); skip reason sheet; auto-scroll; live clock; "Unmarked meds" chip; due-only badge; Missed state during the day; settings rows "Late window", "Remind me every", "Reminder period"; text fixes ("--", labels).
- Voice review uses the time-taken choice and the bulk rule (open doses only).
- Delete `bulk-dose-edit-dialog.tsx` and `retroactive-time-picker.tsx` once replaced.

Acceptance checks:

- Unit: late-window rule for an 08:30 dose with the default 40 minutes: 07:30 (early) no prompt; 09:09 no prompt; 09:10 no prompt; 09:11 prompt; past day prompt; "Always ask" prompt at 08:31; "Never ask" no prompt at 12:00.
- Unit: early take at 07:30 records 07:30.
- Unit: the rule uses instants: a 23:50 dose tapped at 00:20 is inside 40 minutes.
- Unit: a dose taken at 00:40 for a 22:00 dose records the next day.
- Unit: "Take at a specific time" accepts a time 3 days before the dose and a time after now (warning only); a future-day dose is still refused.
- Unit: bulk take is all-or-nothing (inject a failure on dose 3 of 4; no dose changes).
- Unit: bulk take with dose 1 taken at 08:35 and dose 2 skipped: at 09:00 only doses 3 and 4 change; dose 1 keeps 08:35; dose 2 stays skipped. Undo restores doses 3 and 4 only.
- Unit: Take on a taken dose keeps its `actionTimestamp` and debits no stock.
- Unit: missed rule with the defaults: an open 08:30 dose is not missed at 09:00 and is missed at 09:01; a taken or skipped dose is never missed; a missed dose can be taken and then shows "Taken at …".
- DOM: button table in section 4.4 for each slot state.
- E2E (`e2e/medications.spec.ts`): six doses at 08:30; at 09:30 (clock mocked) "Mark all doses" then "Take all" shows the sheet with "Take now", "Take at a specific time" and "Skip"; "Take at a specific time" with 08:30 records 08:30 on all six.
- E2E: at 09:00, "Take all" records 09:00 with no sheet; Undo returns all to open.
- E2E: at 07:30, "Take all" records 07:30 with no sheet.
- E2E: one dose taken at 08:35; "Take all" at 09:00 leaves it at 08:35 and takes the other five at 09:00. No confirmation dialog shows.
- E2E: an untouched 08:30 dose shows "Missed" at 09:01 on the same day.
- E2E: "Untake all" and "Unskip all" appear per the table and restore stock.
- E2E: voice "took my morning meds" at 10:00 asks for the time; at 08:45 it records now with no choice.
- E2E: voice "log all my remaining 08:30 meds as taken at 09:00" with one dose already taken leaves that dose unchanged.

### PR 2: Rescheduling

Scope:

- `DoseLog.remindAt` in types, Drizzle schema and generated migration; sync manifest; legacy `rescheduledTo` reader; CSV export column.
- `dueInstant` helper; `rescheduleDose` (instant, no time limit, warnings only, refuse on taken), `cancelReschedule`, bulk reschedule (open doses only).
- `getDailyDoseSchedule` keeps the original `localTime`; adds `remindAt`; adds the "Carried over" list. Voice planning still matches by the original `localTime`.
- Missed rule uses `remindAt`. `resolveDoseStatus` gets the carried-over exception.
- Reminder builder: rescheduled is not handled; emits at `remindAt`. Push server handled list fixed. (The current native plugin then fires at the new time too, so this PR already fixes gap 5 on the phone.)
- UI: reschedule sheet (time and any date), row and dialog states, "Cancel reschedule", Reschedule in the modal, "Moved to today" group, "Rescheduled meds" chip.

Acceptance checks:

- `schema-parity.test.ts` and `drizzle-journal.test.ts` pass. No hand edit of `_journal.json`.
- Unit: no validation error at now + 1 min, now − 1 hour (warning "This time has passed"), and original + 3 days.
- Unit: reschedule on a taken dose is refused ("Untake the dose first.").
- Unit: a DST change between reschedule and fire keeps the same instant.
- Unit: reminder builder emits reminders at `remindAt` and every interval through the reminder period (10:00, 10:10, 10:20, 10:30 with the defaults).
- Unit: a dose rescheduled to 10:00 with no action is missed after 10:30, not after 09:00.
- Unit: untake after a reschedule: `remindAt` in the future gives "rescheduled"; in the past gives pending, then missed after the reminder period.
- Unit: reschedule after the next dose of the same med shows the warning and still saves.
- Unit: bulk reschedule leaves taken and skipped doses unchanged.
- Unit: a legacy `rescheduledTo: "00:30"` log for a 22:00 dose today converts to 00:30 tomorrow.
- E2E: reschedule one 08:30 dose to 10:00; it stays under 08:30 with "Rescheduled for 10:00"; at 10:05 Take records now with no sheet.
- E2E: "Reschedule" in the modal moves all open doses; Undo restores them.
- E2E: 22:00 dose rescheduled to 00:30 shows in "Moved to today" after midnight and is not missed.
- E2E: a dose rescheduled 2 days ahead shows in "Moved to today" on that day.
- Unit and E2E: tomorrow's 08:30 dose rescheduled to today 20:00 shows in "Moved to today"; Take works today and debits stock; with no action it is missed after 20:30; its reminders fire at 20:00.
- E2E (two devices, `sync-two-devices.spec.ts`): `remindAt` syncs.

### PR 2b: "Apply from" schedule edits

Scope: section 5.10. New `PhaseSchedule` date fields and migration; `scheduleLiveOn` and the reminder builder read them; edit drawer "Apply from"; the change-day log rule.

Reason for a separate PR: it is the med-edit workflow, not a reschedule. It touches the schedule model, titration phases and history, so it needs its own review.

Acceptance checks:

- Unit: a schedule edit applied from today keeps yesterday's time and dose.
- Unit: an edit applied from today, after today's dose is taken, does not show today's dose as open again.
- Unit: an edit applied from a future date leaves the reminders before that date unchanged.

### PR 3: Android reminders (DoseAlarms plugin)

Scope:

- `apps/native`: plugin (alarm, boot, permission-change, post, action receivers; queue with ack; channels; icon; exact-alarm, notification and battery status).
- Upgrade step: cancel all old `@capacitor/local-notifications` alarms; remove the plugin.
- One dose key for Today and the reminder builder (section 5.7).
- `lib/dose-alarms.ts`: grouping by due instant, content, `lateAt`, sync, replay before sync, update of posted notifications.
- Open the modal for the notification's doses from a tap.
- One-time exact-alarm screen (section 6.2).
- Snooze setting; repeats from the interval and the reminder period (section 6.6); late actions "Take now", "Specific time", "Skip"; remaining settings rows in section 6.9; test reminder.
- Push cron removed or disabled.

Acceptance checks:

- Unit: grouping of six 08:30 doses with the defaults gives alarms at 08:30, 08:40, 08:50 and 09:00 and none before 08:30 or after 09:00; a taken dose is not listed; a dose rescheduled to 12:00 joins the 12:00 notification.
- Unit: interval 15 and period 30 give 08:30, 08:45, 09:00; interval 30 and period 20 give only 08:30.
- Unit: "Take all" from a notification with one dose already taken in the app takes only the open doses.
- Unit: the exact-alarm screen shows once when the permission is off and never after "Allow" or "Not now".
- Unit: replay of "Take all" with a queued instant writes that instant; replay on a taken dose does nothing and keeps its time; an action older than the log's `updatedAt` is dropped; an un-acked action replays once.
- Unit: anchor Europe/Berlin, device Asia/Tokyo: a dose taken in the app gets no follow-up.
- Unit (JVM, Robolectric or plain JUnit): the action receiver queues the action and cancels follow-up ids.
- Manual on device, recorded in the PR: upgrade from the old build gives no duplicate reminders; exact alarm at 08:30 ±1 min in Doze; "Take all" from the lock screen with the app killed; reopen shows the doses taken at the tap time; a dose taken in the app removes it from the notification on screen; snooze fires after 10 minutes; repeats fire at 08:40, 08:50 and 09:00 and then stop; late actions "Take now", "Specific time" and "Skip" show at 09:10; "Specific time" opens the time-taken sheet; reboot keeps the alarms; the one-time exact-alarm screen opens the system page.
- `cap-export` CI gate passes. Release-please builds the APK.

### PR 4: Refill alerts and the daily missed-meds alert

Scope:

- Refill projection in `lib/refill-status.ts`; one low-stock rule for all badges.
- Refill alarms through DoseAlarms.
- "Refill reminder time" setting.
- Daily missed-meds alert (section 6.7a).
- Meds tab: the active brand stays visible when its stock is 0 (it does not go to "Out of stock").

Acceptance checks:

- Unit: projection with two doses a day and 20 pills gives the right date.
- Unit: badges on the schedule, Rx card and Meds card agree for the same item.
- E2E: an item below the threshold shows the same "Low" badge everywhere; logging a refill clears it.
- Manual on device: refill notification at 09:00; "Log refill" opens the stock tab.
- Unit: the missed-meds alert is not armed when every due dose is marked.

### PR 5: Web reminder channel (P2, gap 23)

Moved out of PR 3. Gap 23 is P2, the owner uses Android, and PR 3 is already the largest PR.

Scope: section 6.10. The notifier moves to the app shell; same builder, handled rule and `remindAt` logic; refill alerts on web.

Acceptance check: E2E (web): the shell notifier fires with the Medications window closed.

### Later (P2, not in this plan's scope)

- Different dose per time in the Add wizard; every N days; cycles; end date; weekend mode; full-screen popup; web notification actions; Medisafe "snooze until home or work" (location).

## 8. Owner decisions (2026-10-19)

The owner made these decisions on 2026-10-19. They override the Medisafe research. The examples use an 08:30 dose and the default settings.

1. **Slot actions.** "Mark all doses" on the 08:30 group opens a modal. The modal has "Skip all", "Take all", "Untake all" and "Reschedule". "Take all" records the current time ("Take now"). See section 4.4.
2. **Early taps.** There is no prompt for an early tap. If the user taps "Take all" for the 08:30 doses at 07:30, the app records 07:30. See section 4.6.
3. **Late window.** The late window is a setting. The default is 40 minutes. If the user takes the 08:30 doses between 08:30 and 09:10, the app records the current time with no prompt. After 09:10, the app asks: "Take now", "Take at a specific time" or "Skip". See section 4.6.
4. **Late takes do not move later doses.** A late take never moves a later dose. The 20:00 dose stays at 20:00. The app only asks for "now" or a specific time. See sections 4.6 and 5.1.
5. **Missed is automatic.** If a dose gets no user action (taken, skipped or rescheduled) by the end of the reminder period, it becomes Missed. It stays Missed until the user changes it. Only a user action sets Taken or Skipped. Missed shows on the same day, as soon as the period ends. The user can still take or skip a missed dose later. The 08:30 dose with no action is Missed after 09:00. See section 5.8.
6. **Reminders.** The first reminder fires at the dose time (08:30). Then one reminder fires every 10 minutes until the reminder period ends. The default period is 30 minutes (the Medisafe default). So the reminders fire at 08:30, 08:40, 08:50 and 09:00. The interval and the period are settings (defaults 10 and 30 minutes). After the last reminder, no more reminders fire and the dose is Missed. A reminder never fires before the dose time. See section 6.6.
7. **No time limits.** The user can mark a dose taken at any time that he states. The user can reschedule a slot to any time. The 24-hour reschedule limit and the 2-minute minimum are removed. A warning (not a block) shows when the new time is after the next dose of the same med. One guard stays, because the plan depends on it for correctness: a dose of a FUTURE DAY cannot be taken or skipped (stock would be debited for a pill that is still in the bottle). See sections 4.5, 4.6 and 5.3.
8. **Bulk actions change only doses with no user action.** If one 08:30 med was taken at 08:35 (or skipped), "Take all" at 09:00 leaves it unchanged and takes only the others. Voice follows the same rule: "log all my remaining 08:30 meds as taken at 09:00" changes only the open doses. A rescheduled dose is still waiting to be taken, so bulk actions include it. See sections 4.4 and 4.8.
9. **Where a rescheduled dose shows.** The owner did not decide. We use the Medisafe behaviour: the dose stays under its original time and shows "Rescheduled for 10:00". See section 5.5.
10. **Lock screen and exact alarms.** We keep the recommended approach. Our own Android code lets the user act from the lock screen without opening the app. A one-time screen asks the user to allow exact alarms (`SCHEDULE_EXACT_ALARM`). See sections 6.2 and 6.3.

## 9. Review notes

Review on 2026-10-19 against the code on `main` (after PR #444) and the Medisafe help centre. Changes:

1. Header: PR #444 is merged; start each PR from `main`.
2. Section 1: reschedule picks a date and time with no stated limit [HC 8103007]; help-centre labels for long-press Take; notification action labels re-sourced (HC 8103130 does not name them); "Refresh reminder times"; our toolbar change (no Delete).
3. Section 2, new facts from the code: generic name on rows; `resolveDoseStatus` callers (analytics, export, MCP, insights); `takeDose` overwrites the time of a taken dose; refuses future days; `untakeDose` revives an old `rescheduledTo`; `localTime` is the new time for a rescheduled dose; current follow-up range and default (0 to 3, default 2); anchor-date versus device-date key mismatch in the reminder builder; Java-only native project; the APK bundles the web export, so every PR needs an APK; `runPerSlot` bulk path; past taken doses keep their dose snapshot; the existing time zone dialog; synced settings are Postgres columns; skip dialog doubles as confirmation.
4. Gap table: added 19a (reminder for a dose already taken), 19b (missed-meds alert), 19c (max reminders), 19d (Info and Edit).
5. Modal: replaced the overlapping state table with one rule per button; Reschedule hidden until PR 2; Take all and Skip all keep taken doses (marked as a change from Medisafe); confirmation only when a skipped dose changes; bulk "On time" with rescheduled doses; undo restores stock; bulk atomicity through `syncedWrite`, not `db.transaction` (that skips the sync queue); take on a taken dose is a no-op.
6. Dialog and sheets: Info and Edit icons; future-day Take is a labelled change; threshold uses instants (midnight); "Never" stored as -1, not null; "Now" rule for carried-over doses; DST for picked times; current "Ran out" rule; skip-dismiss behaviour change with undo; old reason text kept.
7. Rescheduling: `remindAt` counts only while status is "rescheduled" (`dueInstant` helper); untake after reschedule defined; reschedule twice; legacy `rescheduledTo` conversion limited to today and later with the next-day fix; CSV export column; 24-hour limit marked as our change plus a next-dose warning; quick picks and day labels on a future day; carried-over exception also in `resolveDoseStatus`; data read for the group; travel and one dose key; the live missed rule is a new function so server-side history does not depend on a device setting; 0 follow-ups edge.
8. "Apply from": needs new date fields and a migration; change-day log rule; moved to its own PR 2b.
9. Reminders: exact-alarm revoke, `USE_EXACT_ALARM` option, Doze rate limit, battery and notification permission rows; cancel the old plugin's alarms on upgrade; plugin registration; peek and ack queue; replay before resync; idempotent and ordered replay; lock-screen actions; trampoline rule for taps; notification per due instant and a modal for the notification's doses; update notifications already on screen; offline and other-device limit; late re-post rules for Always and Never; snooze minutes passed to native; follow-up range 0 to 9; stored defaults do not change; refill alarms pre-booked; new daily missed-meds alert (6.7a).
10. PR plan: every PR needs an APK; one open PR at a time; order stated; PR 1 has a settings migration and no Reschedule in the modal; PR 2 notes that it already fixes gap 5 on the current plugin; PR 2b split out; web channel moved from PR 3 to PR 5 (it is P2); PR 4 adds the missed-meds alert; new acceptance checks for the edge cases.
11. Open questions 6 to 8 added (exact alarms, reschedule limit, Take all over taken doses).
12. Owner decisions of 2026-10-19 applied (section 8): modal labels and bulk rule (open doses only, no override dialog); no early prompt; 40-minute "Late window" with "Take now", "Take at a specific time", "Skip"; automatic Missed at the end of the reminder period; reminders by interval and period (08:30, 08:40, 08:50, 09:00); no reschedule or taken-time limits (future-day take guard kept, with reason); "Moved to today" group (first titled "From earlier days"); one-time exact-alarm screen; PR acceptance checks updated.
