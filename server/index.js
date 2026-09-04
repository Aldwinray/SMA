import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import XLSX from "xlsx";
import { loadRows, findExisting, COLUMNS } from "./xlsxStore.js";
import {
  startRun,
  logCall,
  logEscalation,
  checkCeilings,
  getRunSummary,
} from "./usageTracker.js";
import { modelForStep } from "./modelRouter.js";
import { callClaudeWithSearch } from "./webSearch.js";
import { bandDistrict, isBorderline } from "./bandEnrollment.js";
import { lookupDistrict } from "./districtLookup.js";
import { getStateMemo } from "./stateMemo.js";
import { listDistricts } from "./districtList.js";
import { bulkLookupDistricts, getBulkProgress } from "./bulkDistrictLookup.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const XLSX_PATH = process.env.XLSX_PATH
  ? path.resolve(process.cwd(), process.env.XLSX_PATH)
  : path.join(process.cwd(), "data", "districts.xlsx");

// index.js's own bookkeeping — usageTracker has no "does this run already
// exist" check, so runs are started here exactly once per runId.
const knownRuns = new Set();

function ensureRun(runId, state, totalDistricts) {
  if (!knownRuns.has(runId)) {
    startRun(runId, state, totalDistricts);
    knownRuns.add(runId);
  }
}

function newRunId(state) {
  return `${state || "unknown"}-${Date.now()}`;
}

function ceilingGuard(res, runId) {
  const result = checkCeilings(runId);
  if (!result.ok) {
    res.status(429).json({ error: result.reason, runId });
    return false;
  }
  return true;
}

function parseJsonBlock(text) {
  const arrMatch = text.match(/\[[\s\S]*\]/);
  const objMatch = text.match(/\{[\s\S]*\}/);
  const raw = arrMatch ? arrMatch[0] : objMatch ? objMatch[0] : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---- Step 5: Contact lookup (the main, fully-wired feature) ----
app.post("/api/district-lookup", async (req, res) => {
  try {
    const { district, state, force = false, runId: bodyRunId, stateRunTotal } = req.body;
    if (!district || !state) {
      return res.status(400).json({ error: "district and state are required" });
    }

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, stateRunTotal || 1);

    if (force && !ceilingGuard(res, runId)) return;

    const result = await lookupDistrict({
      filePath: XLSX_PATH,
      district,
      state,
      force,
      runId,
    });

    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Download the raw districts.xlsx file as-is (no regeneration) ----
app.get("/api/download-xlsx", (_req, res) => {
  res.download(XLSX_PATH, "districts.xlsx", (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "districts.xlsx not found" });
    }
  });
});

// ---- Export a single state's on-file districts as a standalone .xlsx ----
app.get("/api/districts/export", (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).json({ error: "state query param is required" });

  const normalizedState = state.trim().toLowerCase();
  const rows = loadRows(XLSX_PATH).filter(
    (r) => (r["State"] || "").trim().toLowerCase() === normalizedState
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: `No districts on file for state "${state}"` });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.set("Content-Disposition", `attachment; filename="${state.trim()}-districts.xlsx"`);
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// ---- Step 1: Pull raw district list for a state (cached) ----
app.post("/api/districts/list", async (req, res) => {
  try {
    const { state, refresh = false, runId: bodyRunId } = req.body;
    if (!state) return res.status(400).json({ error: "state is required" });

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, 1);
    if (refresh && !ceilingGuard(res, runId)) return;

    const result = await listDistricts({ state, refresh, runId });
    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Bulk-populate: search every unsearched district from a state's browse
// list in a few batched calls instead of one call per district ----
app.post("/api/districts/bulk-lookup", async (req, res) => {
  try {
    const { state, districts, runId: bodyRunId } = req.body;
    if (!state || !Array.isArray(districts) || districts.length === 0) {
      return res.status(400).json({ error: "state and districts (array) are required" });
    }

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, districts.length);
    if (!ceilingGuard(res, runId)) return;

    const result = await bulkLookupDistricts({
      filePath: XLSX_PATH,
      state,
      districts,
      runId,
    });

    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Progress for an in-flight bulk-populate run ----
app.get("/api/districts/bulk-lookup/progress/:runId", (req, res) => {
  const progress = getBulkProgress(req.params.runId);
  if (!progress) return res.status(404).json({ error: "Unknown or not-yet-started run" });
  res.json(progress);
});

// ---- Preview how many of a state's candidate districts are already on file,
// using the real Step 1 list (approximate, not a certified NCES export) ----
app.post("/api/districts/bulk-lookup/preview", async (req, res) => {
  try {
    const { state, refresh = false, runId: bodyRunId } = req.body;
    if (!state) return res.status(400).json({ error: "state is required" });

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, 1);
    if (refresh && !ceilingGuard(res, runId)) return;

    const list = await listDistricts({ state, refresh, runId });

    let known = 0;
    for (const d of list.districts) {
      if (findExisting(XLSX_PATH, d.district, state)) known += 1;
    }

    res.json({
      state,
      total: list.districts.length,
      known,
      missing: list.districts.length - known,
      districts: list.districts,
      listSource: list.source,
      runId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- All districts on file, across every state ----
app.get("/api/districts", (_req, res) => {
  res.json({ districts: loadRows(XLSX_PATH) });
});

// ---- Step 2: Enrollment banding (plain code, no model) ----
app.post("/api/band", (req, res) => {
  const { enrollment } = req.body;
  if (typeof enrollment !== "number") {
    return res.status(400).json({ error: "enrollment (number) is required" });
  }
  res.json({
    ...bandDistrict(enrollment),
    borderline: isBorderline(enrollment),
  });
});

// ---- Step 3: Bulk suppression check ----
app.post("/api/suppression/bulk", async (req, res) => {
  try {
    const { districts, state, runId: bodyRunId } = req.body;
    if (!Array.isArray(districts) || districts.length === 0) {
      return res.status(400).json({ error: "districts (array) is required" });
    }

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, districts.length);
    if (!ceilingGuard(res, runId)) return;

    const model = modelForStep("suppressionBulk");
    const system = `You are screening school districts for name collisions against a
suppression list of districts that are off-limits for outreach. For each
district given, search and classify it as exactly one of "CLEAR" or
"POSSIBLE MATCH". Return ONLY a JSON array of objects:
[{ "district": "...", "state": "...", "status": "CLEAR" | "POSSIBLE MATCH", "note": "..." }]
Never mark CLEAR from absence of evidence alone if anything ambiguous turns up —
use POSSIBLE MATCH instead so it can be escalated.`;

    const userContent = `Districts to screen:\n${districts
      .map((d) => `- ${d.district}, ${d.state || state}`)
      .join("\n")}`;

    const { text, usage } = await callClaudeWithSearch({ model, system, userContent, maxTokens: 2000 });
    logCall({ runId, step: "suppressionBulk", model, tokensIn: usage?.input_tokens, tokensOut: usage?.output_tokens });

    const results = parseJsonBlock(text);
    if (!results) return res.status(502).json({ error: "Could not parse suppression results", raw: text });

    res.json({ results, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Step 3b: Resolve an ambiguous suppression match ----
app.post("/api/suppression/resolve", async (req, res) => {
  try {
    const { district, state, context, runId: bodyRunId } = req.body;
    if (!district || !state) {
      return res.status(400).json({ error: "district and state are required" });
    }

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, 1);
    if (!ceilingGuard(res, runId)) return;

    const model = modelForStep("suppressionAmbiguous");
    const system = `You are resolving an ambiguous name-match flagged during suppression
screening. Read the provided context and determine whether the flagged
district is genuinely the same entity as the suppressed one, a different
entity that merely shares a common name, or still unresolvable.
Return ONLY JSON: { "status": "CLEAR" | "RESOLVE", "rationale": "..." }.
You may only output "CLEAR" if you can positively confirm the districts are
different entities. If you cannot fully confirm that, output "RESOLVE" —
never default to CLEAR just because evidence is thin.`;

    const userContent = `District: ${district}\nState: ${state}\nAmbiguous match context:\n${context || "(none provided)"}`;

    const { text, usage } = await callClaudeWithSearch({ model, system, userContent });
    logCall({ runId, step: "suppressionAmbiguous", model, tokensIn: usage?.input_tokens, tokensOut: usage?.output_tokens });
    logEscalation(runId);

    const result = parseJsonBlock(text);
    if (!result) return res.status(502).json({ error: "Could not parse resolution", raw: text });

    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Step 4: Qualification scoring, single category ----
app.post("/api/qualify/category", async (req, res) => {
  try {
    const { district, state, category, runId: bodyRunId } = req.body;
    if (!district || !state || !category) {
      return res.status(400).json({ error: "district, state, and category are required" });
    }

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, 1);
    if (!ceilingGuard(res, runId)) return;

    const model = modelForStep("scoreCategory");
    const system = `You are scoring a single qualification category for a school district
against litigation BD criteria. Search for factual evidence on the given
category only. Return ONLY JSON:
{ "category": "...", "score": 0 | 1 | 2, "evidence": "...", "source": "...", "accessDate": "YYYY-MM-DD" }
0 = no evidence found, 1 = partial/weak evidence, 2 = strong evidence.`;

    const userContent = `District: ${district}\nState: ${state}\nCategory to research: ${category}`;

    const { text, usage } = await callClaudeWithSearch({ model, system, userContent });
    logCall({ runId, step: "scoreCategory", model, tokensIn: usage?.input_tokens, tokensOut: usage?.output_tokens });

    const result = parseJsonBlock(text);
    if (!result) return res.status(502).json({ error: "Could not parse category score", raw: text });

    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Step 4b: Composite tier synthesis ----
app.post("/api/qualify/synthesize", async (req, res) => {
  try {
    const { district, state, categoryScores, runId: bodyRunId } = req.body;
    if (!district || !state || !Array.isArray(categoryScores)) {
      return res.status(400).json({ error: "district, state, and categoryScores (array) are required" });
    }

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, 1);
    if (!ceilingGuard(res, runId)) return;

    const model = modelForStep("synthesizeTier");
    const system = `You are synthesizing already-collected qualification category scores into
one overall tier and a short personalization note for outreach. Do not
search for new evidence — weigh only the scores and evidence given. Return
ONLY JSON: { "tier": "A" | "B" | "C" | "D" | "Exclude", "rationale": "...", "personalizationNote": "..." }`;

    const userContent = `District: ${district}\nState: ${state}\nCategory scores:\n${JSON.stringify(categoryScores, null, 2)}`;

    const { text, usage } = await callClaudeWithSearch({ model, system, userContent });
    logCall({ runId, step: "synthesizeTier", model, tokensIn: usage?.input_tokens, tokensOut: usage?.output_tokens });

    const result = parseJsonBlock(text);
    if (!result) return res.status(502).json({ error: "Could not parse synthesis", raw: text });

    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Step 6: State-level context memo (cached) ----
app.post("/api/state-memo", async (req, res) => {
  try {
    const { state, refresh = false, runId: bodyRunId } = req.body;
    if (!state) return res.status(400).json({ error: "state is required" });

    const runId = bodyRunId || newRunId(state);
    ensureRun(runId, state, 1);
    if (refresh && !ceilingGuard(res, runId)) return;

    const result = await getStateMemo({ state, refresh, runId });
    res.json({ ...result, runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Usage summary ----
app.get("/api/run/:runId/summary", (req, res) => {
  const summary = getRunSummary(req.params.runId);
  if (!summary) return res.status(404).json({ error: "Unknown runId" });
  res.json(summary);
});

app.listen(PORT, () => {
  console.log(`District research server listening on port ${PORT}`);
});
