import { findExisting, upsertRow } from './xlsxStore.js';
import { callClaudeWithSearch } from './webSearch.js';
import { modelForStep } from './modelRouter.js';
import { logCall } from './usageTracker.js';

// Fields a search is allowed to update on an existing row. "District" and
// "State" are the lookup key, not a diffable field. "Interest Status" is
// permanently excluded — see xlsxStore.js and CLAUDE.md.
export const UPDATABLE_FIELDS = [
  "Approx. students",
  "Superintendent",
  "Email",
  "Contact no.",
];

export const EXTRACTION_SYSTEM = `You are a research assistant finding public school district contact
information for litigation business-development research.

Search the web for the requested school district and return ONLY a single
JSON object (no prose, no markdown fences) with exactly these keys:
"District", "State", "Approx. students", "Superintendent", "Email", "Contact no.".

Rules:
- Use the most recent, credible source you can find (district website, state DOE,
  NCES). If a field cannot be found, return an empty string for it — never guess.
- Never fabricate or pattern-guess an email address. If you can only infer a
  likely email (e.g. from a known naming convention) rather than find one
  directly stated, prefix it with "INFERRED — VERIFY: ".
- Do not include Interest Status in your output under any circumstances.

For the "Superintendent" field, search in this priority order and use the
first one you can confirm:
  1. Sitting Superintendent (standard case)
  2. Interim/Acting Superintendent, Superintendent-Designee, or an
     Assistant/Deputy Superintendent acting as top administrator
  3. District Administrator, or Chief Executive/Chief School Administrator
     (some states use this title instead of "Superintendent")
  4. Board President/Chair — only as a last resort, if no administrative
     leader can be found at all

Format whichever one you find as "Full Name (Actual Title)" — e.g.
"Jane Doe (Interim Superintendent)" — so it's clear this isn't a standard
sitting superintendent. If truly nothing can be found at any level, return
an empty string.`;

function buildUserContent(district, state) {
  return `District: ${district}\nState: ${state}\n\nFind current superintendent name, contact email, contact phone number, and approximate student enrollment for this school district. Return the JSON object described in your instructions.`;
}

function parseExtraction(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function diffFields(existing, fresh) {
  const changed = [];
  const merged = { ...(existing || {}) };
  merged["District"] = fresh["District"] || existing?.["District"] || "";
  merged["State"] = fresh["State"] || existing?.["State"] || "";

  for (const field of UPDATABLE_FIELDS) {
    const freshValue = (fresh[field] ?? "").toString().trim();
    const existingValue = (existing?.[field] ?? "").toString().trim();
    if (freshValue && freshValue !== existingValue) {
      merged[field] = freshValue;
      changed.push(field);
    } else {
      merged[field] = existingValue;
    }
  }

  return { merged, changed }; 
}

export async function lookupDistrict({ filePath, district, state, force = false, runId }) {
  const existing = findExisting(filePath, district, state);

  if (existing && !force) {
    return { row: existing, changedFields: [], source: "cache" };
  }

  const model = modelForStep("findContacts");
  const { text, usage } = await callClaudeWithSearch({
    model,
    system: EXTRACTION_SYSTEM,
    userContent: buildUserContent(district, state),
  });

  if (runId) {
    logCall({
      runId,
      step: "findContacts",
      model,
      tokensIn: usage?.input_tokens,
      tokensOut: usage?.output_tokens,
    });
  }

  const extracted = parseExtraction(text);
  if (!extracted) {
    if (existing) return { row: existing, changedFields: [], source: "cache-fallback" };
    throw new Error("Search did not return parsable district data.");
  }

  const { merged, changed } = diffFields(existing, extracted);
  const row = upsertRow(filePath, merged);

  return { row, changedFields: changed, source: "search", isNew: !existing };
}


