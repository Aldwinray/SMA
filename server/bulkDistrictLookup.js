import { findExisting, upsertRow } from "./xlsxStore.js";
import { callClaudeWithSearch } from "./webSearch.js";
import { modelForStep } from "./modelRouter.js";
import { logCall, checkCeilings } from "./usageTracker.js";
import { diffFields } from "./districtLookup.js";

const BATCH_SIZE = 15;

// In-memory batch progress for an in-flight run, keyed by runId — same
// ephemeral-Map pattern as usageTracker.js's run registry.
const progressStore = new Map();

export function getBulkProgress(runId) {
  return progressStore.get(runId) || null;
}

const BULK_EXTRACTION_SYSTEM = `You are a research assistant finding public school district contact
information for litigation business-development research, for MULTIPLE districts
in one pass.

For EACH district listed, search the web and produce one JSON object with exactly
these keys: "District", "State", "Approx. students", "Superintendent", "Email",
"Contact no.". Return ONLY a single JSON array containing one such object per
district, in the same order they were given — no prose, no markdown fences.

Rules (apply to every district):
- Use the most recent, credible source you can find (district website, state DOE,
  NCES). If a field cannot be found, return an empty string for it — never guess.
- Never fabricate or pattern-guess an email address. If you can only infer a
  likely email, prefix it with "INFERRED — VERIFY: ".
- Do not include Interest Status in your output under any circumstances.

For the "Superintendent" field, search in this priority order and use the first
one you can confirm:
  1. Sitting Superintendent (standard case)
  2. Interim/Acting Superintendent, Superintendent-Designee, or an
     Assistant/Deputy Superintendent acting as top administrator
  3. District Administrator, or Chief Executive/Chief School Administrator
  4. Board President/Chair — only as a last resort

Format whichever one you find as "Full Name (Actual Title)". If truly nothing can
be found at any level, return an empty string.`;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function parseJsonArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function bulkLookupDistricts({ filePath, state, districts, runId }) {
  const alreadyOnFile = [];
  const unsearched = [];

  for (const name of districts) {
    const existing = findExisting(filePath, name, state);
    if (existing) {
      alreadyOnFile.push({ district: name, row: existing });
    } else {
      unsearched.push(name);
    }
  }

  const searched = [];
  const batches = chunk(unsearched, BATCH_SIZE);

  progressStore.set(runId, {
    totalBatches: batches.length,
    completedBatches: 0,
    totalDistricts: districts.length,
    alreadyOnFile: alreadyOnFile.length,
  });

  for (let b = 0; b < batches.length; b++) {
    const ceiling = checkCeilings(runId);
    if (!ceiling.ok) {
      const remaining = batches.slice(b).flat();
      return { alreadyOnFile, searched, remaining, halted: true, reason: ceiling.reason };
    }

    const batch = batches[b];
    const model = modelForStep("findContacts");
    const userContent = `State: ${state}\n\nDistricts to research (return results in this exact order):\n${batch
      .map((name, i) => `${i + 1}. ${name}`)
      .join("\n")}`;

    const { text, usage } = await callClaudeWithSearch({
      model,
      system: BULK_EXTRACTION_SYSTEM,
      userContent,
      maxTokens: 4000,
    });

    logCall({
      runId,
      step: "findContacts",
      model,
      tokensIn: usage?.input_tokens,
      tokensOut: usage?.output_tokens,
    });

    const extractedArray = parseJsonArray(text);

    for (let i = 0; i < batch.length; i++) {
      const districtName = batch[i];
      const extracted = extractedArray?.[i];

      if (!extracted) {
        searched.push({ district: districtName, error: "Missing or unparsable in batch result" });
        continue;
      }

      const { merged, changed } = diffFields(null, extracted);
      const row = upsertRow(filePath, merged);
      searched.push({ district: districtName, row, changedFields: changed, isNew: true });
    }

    progressStore.set(runId, {
      totalBatches: batches.length,
      completedBatches: b + 1,
      totalDistricts: districts.length,
      alreadyOnFile: alreadyOnFile.length,
    });
  }

  return { alreadyOnFile, searched, remaining: [], halted: false };
}
