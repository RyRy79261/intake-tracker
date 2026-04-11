---
phase: 40
slug: settings-accordion-restructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm build && pnpm lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run `pnpm build && pnpm lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | SET-01 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 40-01-02 | 01 | 1 | SET-01 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 40-02-01 | 02 | 1 | SET-02, SET-06 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 40-02-02 | 02 | 1 | SET-03 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 40-02-03 | 02 | 1 | SET-04 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 40-02-04 | 02 | 1 | SET-05 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 40-03-01 | 03 | 2 | SET-01 | — | N/A | build+lint | `pnpm build && pnpm lint` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This phase is purely UI restructuring — TypeScript build and ESLint are sufficient for structural validation. Visual/behavioral validation is manual.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Accordion single-open-mode | SET-01 | Visual/interaction behavior | Open Tracking, then click Customization — Tracking should close |
| Color-coded accordion headers | SET-01 | Visual styling verification | Each of 6 groups has a distinct colored icon |
| Tracking expanded by default | SET-01 | Visual state on page load | Navigate to /settings — Tracking group is open |
| Inline liquid presets CRUD | SET-02, SET-06 | Interaction flow | Add/edit/delete a liquid preset without any modal opening |
| Inline urination/defecation defaults | SET-02, SET-06 | Interaction flow | Change urination default in Tracking group inline |
| Inline weight graph toggles | SET-02, SET-06 | Interaction flow | Toggle weight graph options in Tracking group inline |
| Animation timing in Customization | SET-03 | Visual location check | Scroll speed, hide delay, bar transition visible in Customization group |
| Medication section on settings page | SET-04 | Visual presence check | Region selects visible in Medication group |
| Storage info display | SET-05 | Data accuracy | Storage section shows IndexedDB usage estimate and record counts |
| Local only badge | SET-05 | Visual presence | "Local only" badge visible in Data & Storage group |
| No CustomizationPanel dialog | SET-06 | Absence verification | No "Defaults & Customizations" button or dialog exists |
| Reset/About outside accordion | SET-01 | Visual layout | Reset to Defaults and About at bottom of page, not inside any group |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
