# Clinical research: doctor-relevant insights for the intake tracker

**Context.** The app has no fixed diagnosis. Conditions are free text in the Profile, and the settings defaults are 1000 ml of fluid and 1500 mg of sodium a day. The weight-note test mentions "after dialysis", and `bp-derived-trends.tsx` already cites HF haemodynamics. A 1 L limit with 1.5 g of sodium points to **heart failure and/or advanced CKD or dialysis, with hypertension**. Insights should be keyed to the user's conditions and limits, not hard-coded to one disease.
**Method.** I ran a few web searches (results below). The rest comes from my own knowledge of the guidelines, so check citations marked [K] against the source.

## Ranked insights

**1. Rapid weight gain alert (decompensation).** HIGH doctor-visit value.
- *Computation:* Use the first weight after waking each day (or the earliest weight of the day). Take Δ = today − the same reading 1 day and 3 days earlier. Alert when Δ1d > 1 kg, Δ3d > 2 kg, or Δ7d > 2.3 kg (5 lb).
- *Rationale:* The ESC patient material tells patients to contact their team after **>2 kg in 3 days** (https://www.heartfailurematters.org/warning-signs/rapid-weight-gain/). The AHA HF tracker uses 2–3 lb in a day or 5 lb in a week (https://u1-cd-cpr.sc.heart.org/-/media/Files/Health-Topics/Heart-Failure/HF-Symptom-Tracker.pdf). In Chaudhry et al. (Circulation 2007, PMID 17846286), weight started rising about 30 days before HF admission and diverged sharply in the final week. The odds of admission rose stepwise with gains of 2–5 lb, 5–10 lb and >10 lb.
- *Show as:* "Weight up X kg in 3 days. Your care plan may say to contact your team." Never "take an extra diuretic", unless the user has entered a clinician's flexible-diuretic plan.

**2. Dry-weight drift and a 30-day weight slope.** HIGH.
- *Computation:* A 7-day rolling median of morning weights, and an OLS slope in kg/week over 30 days. If the user sets a target or dry weight, show the distance from it (for dialysis, the gain between sessions).
- *Rationale:* The Chaudhry study shows a slow rise before admission. For dialysis, KDOQI asks for interdialytic weight gain below about 4–4.5% of dry weight [K]. Expected losses in the first weeks after starting or raising a diuretic or SGLT2i (≈1–2 kg) should be labelled as such.

**3. Home BP summary in guideline format.** HIGH.
- *Computation:* Use the ESH "722" protocol: 2 readings, morning (before meds) and evening, for 7 days. Drop day 1 and average days 2–7, with at least 12 readings (3 days minimum). Report the mean of morning and evening readings separately. Mark the result as provisional when the protocol is incomplete.
- *Thresholds:* A home average of ≥135/85 equals office hypertension (ESH 2023, Mancia et al., J Hypertens; https://journals.lww.com/jhypertension/fulltext/2023/12000/2023_esh_guidelines_for_the_management_of_arterial.2.aspx). A home average of 130/80 corresponds to an office target of 130/80 (AHA 2019 BP-measurement statement, Muntner et al., https://www.ahajournals.org/doi/10.1161/HYP.0000000000000087 [K]). Evidence on discarding day 1 is mixed: day 1 runs about 2.8/1.4 mmHg higher (https://eprints.um.edu.my/41142).
- *Doctor value:* This is the number clinicians use to titrate. Present it as "Home average (days 2–7): 138/84, n=24".

**4. Medication-change response panel (before vs after).** HIGH.
- *Computation:* For each change in dose or phase, compare the mean BP, HR and morning weight in the 7 days before with a window after. The after window starts at the class's onset lag:
  - ACEi/ARB/ARNI: BP plateau in about 2–4 weeks.
  - Amlodipine: about 1–2 weeks.
  - Thiazide (for BP): 2–4 weeks.
  - Beta-blocker: HR within days, BP 1–2 weeks.
  - Loop diuretic: hours (weight within 1–3 days).
  - MRA: weeks, with K+/creatinine labs due at about 1 and 4 weeks.
  - SGLT2i: weight −1 to 2 kg in the first weeks.
  Show the Δ with a 95% CI and n. Label "too early to judge" when the window is shorter than the lag.
- *Rationale:* ESC 2021 HF guideline: up-titrate every 1–2 weeks and monitor BP, HR, K+ and renal function (McDonagh et al., https://academic.oup.com/eurheartj/article/42/36/3599/6358045). Lag figures are [K].

**5. Safety-signal flags on side effects.** HIGH.
- *Symptomatic hypotension:* a home SBP < 90 (or < 100 for HF), or a journal entry for dizziness or fainting within 0–4 h after an antihypertensive dose.
- *Bradycardia:* HR < 50 while on a beta-blocker, ivabradine or digoxin. ESC: reduce the dose if HR < 50 with symptoms.
- *Hyperkalaemia risk:* an MRA or ACEi/ARB/ARNI is active and logged potassium is above the user's limit, or a potassium-chloride "low-sodium salt" substitute was logged. ESC 2021 and KDIGO advise against K-based salt substitutes with these drugs.
- *Severe BP:* ≥ 180/120 with symptoms (chest pain, breathlessness, neuro) → show "seek urgent care" only, as a fixed message.

**6. Medication adherence and timing.** MED-HIGH.
- *Computation:*
  - PDC = days covered ÷ days in period, from dose logs. Count a day as covered when all of that day's scheduled doses were taken. Threshold ≥ 80% (PQA standard [K]).
  - On-time % = share of taken doses within ±60 min of schedule.
  - Timing SD in minutes.
  - Skipped doses broken down by medication and weekday.
- *Doctor value:* Clinicians ask "are you actually taking it?" before they up-titrate.

**7. Morning vs evening BP and morning surge.** MED.
- *Computation:* Morning mean − evening mean (SBP). Also the morning mean before vs after the morning dose.
- *Rationale:* A morning–evening difference > 15–20 mmHg suggests waning drug effect or morning hypertension (Kario, Circulation 2003 [K]). This can drive dose-timing discussions; the decision is the doctor's.

**8. BP variability.** MED.
- *Computation:* Over ≥ 12 readings in 30 days: SD, CV = SD/mean, and ARV = mean |SBPᵢ₊₁ − SBPᵢ| over successive readings (Mena et al., J Hypertens 2005 [K]).
- *Rationale:* Home variability independently predicts CV risk. No clinical cutoff exists, so show a trend rather than an alert.

**9. Time in target range (TTR).** MED.
- *Computation:* Linearly interpolate daily mean SBP between readings and report the % of days within the target (default 110–130 or the user's target).
- *Rationale:* Higher TTR is consistently linked to fewer CV events (review: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11461595/). It is easier to understand than averages.

**10. Orthostatic difference.** MED (only if the user logs standing readings).
- *Computation:* Pair a sitting or lying reading with a standing reading taken within 5 min. Δ = standing − sitting.
- *Threshold:* An SBP drop ≥ 20 or DBP drop ≥ 10 within 3 min of standing is the consensus orthostatic hypotension definition (Freeman et al., Clin Auton Res 2011 [K]). This matters with diuretics and over-diuresis.

**11. Pulse pressure, MAP and resting HR trend.** LOW-MED.
- *Computation:* PP = SBP − DBP and MAP = DBP + PP/3, reported as 30-day means. Also the resting HR trend.
- *Rationale:* A narrow PP (PP/SBP < 25%) suggests low output in advanced HF (Stevenson 1989, already in the app). A rising resting HR is a decompensation and beta-blocker titration marker.

**12. Fluid restriction adherence and timing.** MED.
- *Computation:*
  - % of days with total fluid ≤ the limit, and ≤ limit + buffer.
  - Median overshoot in ml.
  - Share of fluid drunk after 18:00 and in the 2 h before bed.
  - Longest within-limit streak.
- *Rationale:* ESC 2021: 1.5–2 L restriction only for severe HF or hyponatraemia, and avoid > 3 L. Benefit is uncertain (FRESH-UP, Nat Med 2025 [K]). Present it neutrally as "adherence to your set limit", not as outcome advice.

**13. Sodium adherence and hidden sources.** MED.
- *Computation:* % of days ≤ the sodium limit. Rank the top sodium contributors (food items, drinks such as mineral water and broths) by share of 30-day sodium. Show the day-level correlation between sodium and the next morning's Δweight.
- *Rationale:* Most sodium comes from processed food. SODIUM-HF (Ezekowitz, Lancet 2022 [K]) found no event reduction from < 1500 mg vs usual care, so frame this as personal pattern-finding.

**14. Fluid balance proxy.** MED-LOW.
- *Computation:* Daily intake − estimated urine output (sum of urination amount estimates, with "small/medium/large" mapped to roughly 150/300/450 ml). Show a 7-day trend and flag incomplete urination logging.
- *Rationale:* Insensible losses (about 500–800 ml/day) and food water make the absolute value unreliable, so show only the trend. Morning weight is the better balance signal; say so in the UI.

**15. Diuretic response.** MED.
- *Computation:* Voids and estimated volume in the 6 h after a loop-diuretic dose vs the same window on non-dose days or before the dose. Also the time to first void.
- *Rationale:* The HFA 2019 position statement (Mullens et al. [K]) judges response by urine output > 100–150 ml/h in the first 6 h (or spot urine Na > 50–70 mmol/L at 2 h). This is only a proxy at home, but a falling response is useful to report.

**16. Nocturia.** MED.
- *Computation:* Voids between the user's bedtime and day start, as a nightly count with a 7-day mean.
- *Threshold:* ≥ 2 a night is clinically bothersome (ICS definition: ≥ 1 [K]). Nocturia can reflect fluid redistribution at night in HF, evening fluid loading, or late diuretic timing, which ties back to insight 12.

**17. Caffeine and alcohol vs BP.** LOW-MED.
- *Computation:* For BP readings within 3 h after caffeine > 80 mg, compare the mean against other readings. Show the SBP difference with n. For alcohol, use the next-morning BP.
- *Rationale:* Caffeine raises BP acutely for about 1–3 h (Mesas et al., AJCN 2011 [K]). Alcohol lowers BP for up to about 12 h and then raises it (Tasnim, Cochrane 2020 [K]). It also explains confounded readings, so tag readings as "within 3 h of caffeine".

**18. Symptom context (journal linkage).** HIGH for the printout.
- *Computation:* For each journal entry, show the 72 h before it: weight Δ, the last BP and HR, missed or late doses, fluid and sodium vs limits, and alcohol and caffeine. Across entries, count how often a symptom follows a pattern (e.g. "4 of 5 dizziness entries were within 3 h of a morning dose"). Report counts, not p-values.

**19. Bowel pattern.** LOW.
- *Computation:* Bowel movements per week and the longest gap. Flag < 3 per week (Rome IV constipation criterion) or a gap > 3 days.
- *Rationale:* Fluid restriction, diuretics, iron, CCBs and opioids constipate. Straining is relevant in HF. This is mainly a comfort topic to raise with the doctor.

## The pre-appointment printout (one page)
Section order:
1. Period and data completeness (days with weight, BP readings, dose logs).
2. Home BP summary (insight 3) with morning and evening means.
3. Weight trend with alert events.
4. Medication list, changes and their measured responses (insight 4).
5. Adherence (PDC, missed doses).
6. Safety flags (insight 5).
7. Fluid and sodium adherence.
8. Nocturia and diuretic response.
9. Journal symptoms with their 72 h context.
10. The user's questions (free text).

Put dates and n on everything. The NICE CG182/NG106 and NG136 style (summaries of home averages, a symptom diary, weights) is what GPs and HF nurses expect [K].

## Safety: do NOT present as advice
- No dose, timing, diuretic or fluid-limit changes. Show the evidence and "discuss with your clinician". The one exception is restating a clinician plan the user typed in (e.g. "your plan: extra furosemide if +2 kg").
- No causal claims from small n. Write "associated in your data (n=6)", and show nothing when n < 5.
- No diagnosis labels ("you have orthostatic hypotension"). Write "readings met the standard definition for X; mention to your doctor".
- Show red-flag messages (BP ≥ 180/120 with symptoms, chest pain, fainting, sudden breathlessness, weight +2 kg/3 d) as fixed text that points to the care team or emergency services. AI must never generate them.
- Do not suggest potassium salt substitutes or high-K foods to cut sodium when an MRA, ACEi, ARB or ARNI is active, or in CKD.
- Fluid-balance and urine-volume figures are estimates; label them that way.
- Note that guideline thresholds (2 kg/3 d, 135/85) are population defaults, and let the user's clinician override them in settings.

## Sources (from searches)
- https://www.heartfailurematters.org/warning-signs/rapid-weight-gain/
- https://u1-cd-cpr.sc.heart.org/-/media/Files/Health-Topics/Heart-Failure/HF-Symptom-Tracker.pdf
- https://www.hse.ie/eng/about/who/healthwellbeing/selfmanagement/resources-for-people-living-with-a-long-term-health-condition/heart-failure-traffic-light-guide.pdf
- https://www.reliasmedia.com/articles/8984-weight-gain-predictor-of-heart-failure-hospitalization (Chaudhry 2007 summary)
- https://eprints.um.edu.my/41142 (722 protocol rationale)
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11461595/ (BP TTR review)
- [K] = from my own knowledge, not fetched; verify: ESC 2021 HF, ESH 2023, AHA 2019 measurement statement, Mena 2005 ARV, Kario 2003, Freeman 2011, HFA 2019 diuretic statement, SODIUM-HF 2022, FRESH-UP 2025, Mesas 2011, Tasnim 2020, PQA PDC.
