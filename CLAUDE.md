# CLAUDE.md — District Research Webapp: Task Routing & Model Usage Policy

## Purpose

This project runs the "School District Target Research" workflow (state-agnostic
litigation BD research prompt: district universe → banding → suppression screen →
qualification scoring → contact research → state memo). That full workflow is
**expensive if run as one giant call per state** — it can involve dozens to hundreds
of searches per state. This file tells Claude Code how to decompose the workflow and
which model tier to use for each piece, so token/API spend stays proportional to task
complexity.

Read this file before executing any multi-step research run. If a task isn't listed
below, default to the "Judgment call" rule at the bottom rather than guessing.

---

## Core principle

**Split by cognitive load, not by convenience.** Most of this workflow is
lookup-and-format work (cheap model). A smaller slice is genuine synthesis, scoring
judgment, or ambiguity resolution (expensive model). Never run the whole pipeline
end-to-end on the top-tier model — route each sub-task individually.

**Check local data before calling any model.** The `.xlsx` file in `server/data/`
is the actual database for this project. Every district lookup (State + District)
must check that file for an existing match *first*, before making any API call. If
found, return the existing row instantly — zero tokens spent. Only call the model
(with web search) when the district is genuinely new, or when the caller explicitly
requests a refresh. This is the single biggest cost lever in the whole system — more
impactful than model tier choice — and it must never be bypassed by default.

---

## Hard rule: Interest Status is never touched by code

The `Interest Status` column in the xlsx file is set **manually, by hand, directly
in Excel**, after a human actually contacts a district. No code path — search,
refresh, or any future feature — may read, infer, guess, or write to this field.
Every write function in this project must treat `Interest Status` as untouchable:
carry forward whatever value already exists on a row, and leave it blank only when
creating a brand-new row. If a future task seems to require setting this field
programmatically, stop and flag it rather than implementing it — this is a
deliberate, standing constraint, not an oversight to "fix."

---

## Model tiers (concrete names)

Use these actual model strings when calling the API — don't leave tier selection
implicit or let an agent "decide" which model counts as small/mid/large.

| Tier | Model string | Rationale |
|------|--------------|-----------|
| Small/fast | `claude-haiku-4-5-20251001` | Strong enough for structured extraction, formatting, and batch lookups at low cost. Default for most steps. |
| Mid-tier | `claude-sonnet-5` | Used only for the one step that needs real synthesis but not deep legal reasoning. |
| Large/reasoning | `claude-opus-5` | Reserved for genuine ambiguity resolution and legal-nuance synthesis. Most expensive — used least often. |
| No model | plain code | Some steps are pure logic (see Step 2) and should not call an LLM at all. |

## Task decomposition & model routing

| # | Sub-task | Nature of work | Model | Notes |
|---|----------|-----------------|------------|-------|
| 1 | Pull raw district list from NCES/state DOE/board association (Step 1) | Data retrieval, light reconciliation | `claude-haiku-4-5-20251001` | Mostly fetching + table-building. No judgment needed beyond matching names. |
| 2 | Enrollment banding (Step 2) | Deterministic bucketing by number | **plain code — no LLM call** | This is an `if enrollment >= X && <= Y` lookup. Calling any model for this wastes a full API round-trip. |
| 3 | Suppression screen — bulk pass (Step 3, "no match found") | Search + simple yes/no | `claude-haiku-4-5-20251001` | Batch these; most districts will be a clean CLEAR. |
| 3b | Suppression screen — ambiguous name matches (Step 3, POSSIBLE MATCH) | Disambiguation, reading context, judgment call | `claude-opus-5` | Escalate only the flagged ambiguous cases, not the whole batch. |
| 4 | Qualification scoring, single category (e.g., phone-policy search) | Targeted search + score 0/1/2 | `claude-haiku-4-5-20251001` | Run per-category per-district; keep prompts narrow and factual. |
| 4b | Qualification scoring, composite synthesis + tiering rationale | Weighing evidence, writing personalization notes | `claude-sonnet-5` | Only after all category scores are collected — synthesize once, not per search. |
| 5 | Decision-maker contact lookup (per district) | Search + extract structured fields | `claude-haiku-4-5-20251001` | Strict "found vs inferred vs unverified" tagging is a formatting rule, not a reasoning task. |
| 6 | State-level context memo (Step 6) | Genuine synthesis: legal posture, retention mechanics, SOL flags, cultural notes | `claude-opus-5` | This is the one piece that benefits from the strongest model — legal nuance and cross-source synthesis matter here. Cache the result (see below) — don't regenerate on every rerun. |
| 7 | Final output assembly (memo + table + watch list) | Formatting/merging already-generated pieces | **plain code — no LLM call** | Don't regenerate content here — just merge the JSON/structured output tasks 1–6 already produced. |

**Note on current implementation:** the live backend (`server/`) currently implements
a simplified, working version of Step 5 as `POST /api/district-lookup` — it does the
file-first check + diff-based refresh described above, using the `findContacts` model
tier. Steps 1, 3, 3b, 4, 4b, and 6 are scaffolded as separate endpoints but are not
yet wired into a full end-to-end pipeline. When extending the app, keep new endpoints
consistent with this table rather than inventing new model choices ad hoc.

## Recommended architecture

Prefer a **backend router** that explicitly calls the right model per step, rather
than a single agentic session that decides at runtime which model to use internally.
Self-routing is harder to audit and prone to "just use the best model to be safe"
drift. A backend router gives a hard guarantee on cost and makes usage logs trustworthy.

Rough call shape:

```
runDistrictResearch(state) →
  step1_pullDistricts(state)        // haiku, batched ~20 districts/call
  step2_bandEnrollment(list)        // plain code, no LLM
  step3_suppressionBulk(list)       // haiku, batched
  step3b_resolveAmbiguous(flagged)  // opus, one at a time
  step4_scoreCategories(district)   // haiku, per category
  step4b_synthesizeTier(scores)     // sonnet
  step5_findContacts(district)      // haiku
  step6_stateMemo(state)            // opus, once, cached
  step7_assembleOutput(all)         // plain code, no LLM
```

---

## Batching rules (to cut call count, not just model cost)

- **Never make one API call per district for simple lookups.** Batch 10–20 districts
  per call for Steps 1, 3 (bulk suppression), and 5.
- **Do make one call per district for Step 4b and district counsel identification** —
  these need per-district context and shouldn't be blended together.
- **Cache the state memo (Step 6) hard.** Store it keyed by `state + generated_date`
  (a DB row or even a flat JSON file is fine). Don't regenerate it just because the
  district table is rerun for the same state — only regenerate if the person
  explicitly asks for a refresh, or the cached memo is older than ~30 days.
- **On any refresh, update only fields that actually changed.** When re-searching a
  district that already has a row, diff the fresh result against the existing row
  field by field. Only overwrite a field if the search found a real, non-empty value
  that differs from what's stored. If the search comes back empty or unchanged on a
  field, keep the existing value — never let an incomplete search result blank out
  good data that was already there. (`Interest Status` is exempt from this diff
  entirely — see the hard rule above; it's never part of the comparison.)

## Hard ceilings (cost circuit breakers)

Set these as config values in the webapp, not as soft guidelines an agent can talk
itself out of:

- `MAX_CALLS_PER_STATE_RUN` — if a single state run exceeds this, halt and surface a
  warning to the user instead of continuing silently.
- `MAX_ESCALATIONS_PER_RUN` — if Step 3b's ambiguous-match queue exceeds roughly 15%
  of total districts in the run, stop and flag it. A high escalation rate usually
  means the source data for that state is messier than normal and is worth a human
  check before burning further Opus calls.
- Both ceilings should be adjustable per state (some states genuinely have more
  ambiguous name collisions — e.g., many "Franklin," "Madison," or numbered county
  districts) but should never be silently uncapped.

## Usage dashboard

Log every call as `{step, model, tokens_in, tokens_out, state, timestamp}`. Even a
minimal version of this enables:

- A running per-state cost readout in the UI ("This state run: $X so far").
- Fast detection of runaway loops, especially around the Step 3b escalation path.
- A simple way to confirm the routing table above is actually being followed in
  practice, not just in this file.

---

## Escalation rule (when to bump to the large model mid-task)

Start every sub-task on the assigned tier. Escalate one tier up **only** when:
- A suppression search returns an ambiguous or partial name match (Step 3 → 3b).
- Two data sources conflict (e.g., NCES enrollment vs. state DOE enrollment differ by
  a meaningful margin) and the discrepancy needs a judgment call on which to trust.
- A contact record can't be cleanly classified as found/inferred/unverified and needs
  a written justification.

Do not escalate just because a task "might be complex" — escalate on an actual
observed ambiguity.

---

## Hard rules carried over from the research prompt itself

These apply regardless of which model tier is running the sub-task:

- Never fabricate or pattern-guess a contact email and present it as found. Mark
  inferred emails `INFERRED — VERIFY`.
- Never mark a suppression status `CLEAR` from absence of evidence alone if any
  ambiguous match was found anywhere — mark it `RESOLVE` instead.
- Every enrollment figure, filed-status determination, and contact record needs a
  cited source + access date.
- This is **research only** — no task in this pipeline should draft or send outreach
  communications to a district.

---

## Usage monitoring

- Log which model tier handled each sub-task run (a simple `[task #] [model] [state]
  [timestamp]` line is enough) so usage can be reviewed per state run.
- If a single state run is trending toward unusually high call counts (e.g., far more
  ambiguous suppression matches than typical), pause and flag it rather than
  continuing to escalate automatically — that pattern usually means the source data
  is messier than normal for that state, and it's worth a quick human check before
  burning further calls.

---

## Judgment call rule

If a requested task doesn't map cleanly to the table above, default to the
**smallest model that can do the task without needing to re-run it**, and escalate
only if the output comes back incomplete, ambiguous, or clearly wrong. It's cheaper
to occasionally re-run a small-model task than to default every task to the largest
model "just in case."
