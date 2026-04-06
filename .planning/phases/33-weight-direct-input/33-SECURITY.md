---
phase: 33
slug: weight-direct-input
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-06
---

# Phase 33 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| User keyboard input → pendingWeight state | Untrusted numeric string from keyboard input | String → parseFloat → number |
| pendingWeight → Dexie write | Parsed float persisted to IndexedDB | number → IndexedDB weightRecords |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-33-01 | Tampering | InlineEdit handleBlur | mitigate | parseFloat + isNaN check + clamp to [min, max] before onValueChange; invalid input reverts silently (`inline-edit.tsx:82-89`) | closed |
| T-33-02 | Denial of Service | InlineEdit handleChange | accept | Standard browser input behavior; value is string in React state only — no amplification vector | closed |
| T-33-03 | Tampering | weight-card roundOnBlur | mitigate | Double validation: InlineEdit clamp (`inline-edit.tsx:89`) + Zod WeightFormSchema positive+max 1000 (`weight-card.tsx:14-16,109`) | closed |
| T-33-04 | Information Disclosure | weight display | accept | Weight value in client-side IndexedDB only; no server transmission in this flow | closed |
| T-33-03-01 | Tampering | inline-edit.tsx handleBlur | accept | parseFloat + isNaN + clamp already in place; type="text" does not change the validation path | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-33-01 | T-33-02 | No rate limiting on onChange — standard browser input behavior; value is just a string in React state with no server-side amplification | Phase plan | 2026-04-06 |
| AR-33-02 | T-33-04 | Weight value stored only in client-side IndexedDB; displayed to local user only; no server transmission in this flow | Phase plan | 2026-04-06 |
| AR-33-03 | T-33-03-01 | parseFloat + isNaN + clamp mitigation already present from T-33-01; changing input type="text" does not alter validation path | Phase plan | 2026-04-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-06 | 5 | 5 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-06
