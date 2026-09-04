import fs from "fs";
import path from "path";
import { callClaudeWithSearch } from "./webSearch.js";
import { modelForStep } from "./modelRouter.js";
import { logCall } from "./usageTracker.js";

const CACHE_PATH = path.join(process.cwd(), "data", "stateMemos.json");
const MAX_AGE_DAYS = 30;

const MEMO_SYSTEM = `You are a legal/BD research analyst producing a state-level context memo
for litigation business-development targeting of school districts.

Cover: legal posture toward the relevant claim type in this state, records
retention mechanics that matter for evidence, statute-of-limitations flags,
and any cultural/procedural notes that affect outreach strategy. Cite a
source with an access date for every legal or procedural claim. Return
plain text, well-organized under headings.`;

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function isFresh(generatedDate) {
  const ageMs = Date.now() - new Date(generatedDate).getTime();
  return ageMs < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export async function getStateMemo({ state, refresh = false, runId }) {
  const cache = loadCache();
  const cached = cache[state];

  if (cached && !refresh && isFresh(cached.generated_date)) {
    return { ...cached, source: "cache" };
  }

  const model = modelForStep("stateMemo");
  const { text, usage } = await callClaudeWithSearch({
    model,
    system: MEMO_SYSTEM,
    userContent: `State: ${state}\n\nProduce the state-level context memo described in your instructions.`,
    maxTokens: 3000,
  });

  if (runId) {
    logCall({
      runId,
      step: "stateMemo",
      model,
      tokensIn: usage?.input_tokens,
      tokensOut: usage?.output_tokens,
    });
  }

  const entry = { state, memo: text, generated_date: new Date().toISOString() };
  cache[state] = entry;
  saveCache(cache);

  return { ...entry, source: "generated" };
}
