# PROJECT_FLOW.md — How This App Works

A plain-language map of the whole system: what exists, how a search flows through
it, and where the safety rules live. Read this alongside `CLAUDE.md` (which covers
model routing/cost policy) — this file covers the actual data flow.

---

## What this project is

A webapp for looking up U.S. school district contact info (superintendent, email,
phone, enrollment) for litigation outreach research. The "database" is a single
real Excel file (`server/data/districts.xlsx`) — there is no separate database
system. The backend reads/writes that file directly.

```
my-app/
├── src/                  ← frontend (Vite) — UI not yet built
├── server/               ← backend (Express) — fully functional
│   ├── data/
│   │   └── districts.xlsx   ← the actual "database"
│   ├── index.js             ← API endpoints
│   ├── districtLookup.js    ← core search + diff-update logic
│   ├── xlsxStore.js         ← low-level file read/write
│   ├── modelRouter.js       ← which Claude model handles which task
│   ├── webSearch.js         ← Claude + web_search tool wrapper
│   ├── bandEnrollment.js    ← enrollment banding (pure code, no model)
│   └── usageTracker.js      ← per-run call logging + cost ceilings
├── CLAUDE.md             ← model/cost policy for Claude Code
└── PROJECT_FLOW.md       ← this file
```

---

## The main flow: searching a district

This is what happens every time someone searches a State + District.

```
 1. Person enters: District name + State
                    │
                    ▼
 2. Backend opens districts.xlsx and looks for a
    matching row (case-insensitive, trimmed)
                    │
        ┌───────────┴───────────┐
        │                       │
   FOUND (and not          NOT FOUND
   forcing a refresh)      (or refresh requested)
        │                       │
        ▼                       ▼
  Return that row       Call Claude (haiku model)
  instantly.             with the web_search tool
  ZERO API cost.                │
                                 ▼
                          Claude searches the web,
                          returns structured JSON:
                          District, State, Approx.
                          students, Superintendent,
                          Email, Contact no.
                                 │
                                 ▼
                          Compare each field against
                          the existing row (if any):
                            - New/different value found?
                              → use it, mark as "changed"
                            - Same value, or search found
                              nothing?
                              → keep the existing value
                                 │
                                 ▼
                          Interest Status is NEVER part
                          of this comparison — always
                          carried forward untouched
                                 │
                                 ▼
                          Write the row back into
                          districts.xlsx
                                 │
                                 ▼
                          Return the row + list of
                          which fields actually changed
```

**In short:** reading is free when the data already exists. Writing only happens for
new districts or explicit refreshes, and even then, only touches fields that
genuinely changed.

---

## Why the file is checked first (cost logic)

The Excel file works as a cache that never expires on its own. Every district you've
ever successfully looked up becomes a permanent, free shortcut:

- 1st search for a district → costs one API call, gets saved to the file
- Every search after that → free, instant, reads straight from the file
- The only way to spend a token on an already-known district is an explicit
  "Refresh" action

This is the single biggest cost control in the app — bigger than which model tier is
used, because it avoids the API call entirely most of the time.

---

## The three ways `Interest Status` can be affected — and the rule

| Action | Effect on Interest Status |
|---|---|
| New district gets searched for the first time | Starts blank |
| Existing district gets refreshed (`force: true`) | Left completely untouched, no matter what the search returns |
| Someone opens `districts.xlsx` in Excel and types a value | This is the **only** way it ever changes |

This is enforced in code (`xlsxStore.js`), not just by convention — the write
function structurally cannot overwrite that column except through one internal
function that nothing in the search/refresh path calls.

**Practical note:** since edits happen by hand in Excel, close the file in Excel
before running a search through the app — an open file can be locked and block the
app's write.

---

## The other pipeline steps (scaffolded, not yet wired end-to-end)

The original research prompt this project is based on has 6 steps (district
universe → banding → suppression screen → qualification scoring → contact research
→ state memo). Right now, **only the contact-lookup piece (Step 5) is fully built
and working** — that's the `/api/district-lookup` flow described above.

The other steps exist as separate, working endpoints, but aren't yet chained
together into one automated run:

| Step | Endpoint | Status |
|---|---|---|
| 2 — Enrollment banding | `POST /api/band` | Working (pure code, no model) |
| 3 — Bulk suppression check | `POST /api/suppression/bulk` | Working, callable individually |
| 3b — Resolve ambiguous match | `POST /api/suppression/resolve` | Working, callable individually |
| 4 — Qualification category score | `POST /api/qualify/category` | Working, callable individually |
| 4b — Composite tier synthesis | `POST /api/qualify/synthesize` | Working, callable individually |
| 5 — Contact lookup | `POST /api/district-lookup` | **Fully wired, this is the main feature** |
| 6 — State memo | `POST /api/state-memo` | Working, callable individually |
| Usage summary | `GET /api/run/:runId/summary` | Working |

Every model call anywhere in this list goes through `modelRouter.js`, so the model
tier for a given task is never hardcoded ad hoc — see `CLAUDE.md` for the full
tier table and cost rules.

---

## Where to look when...

- **"I want to change what data gets searched for"** → `districtLookup.js`,
  specifically the `EXTRACTION_SYSTEM` prompt and `UPDATABLE_FIELDS` list.
- **"I want to change which model handles a task"** → `modelRouter.js`'s
  `STEP_MODEL` table. Never hardcode a model string anywhere else.
- **"I want to change the xlsx column format"** → `xlsxStore.js`'s `COLUMNS`
  constant. Changing this changes what every endpoint reads/writes.
- **"I want to add a cost limit"** → `usageTracker.js` and the `.env` values
  `MAX_CALLS_PER_STATE_RUN` / `MAX_ESCALATIONS_PER_RUN_PCT`.
- **"Something touched Interest Status that shouldn't have"** → check
  `upsertRow()` in `xlsxStore.js` — it should be structurally impossible unless
  `allowInterestStatusUpdate: true` was explicitly passed, which nothing in the
  current codebase does.
