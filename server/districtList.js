import fs from "fs";
import path from "path";
import { callClaudeWithSearch } from "./webSearch.js";
import { modelForStep } from "./modelRouter.js";
import { logCall } from "./usageTracker.js";

const CACHE_PATH = path.join(process.cwd(), "data", "stateDistricts.json");
const MAX_AGE_DAYS = 30;

const PULL_SYSTEM = `You are compiling a list of public school districts for a given
U.S. state, for litigation business-development research. Search NCES, the state
Department of Education, or the state school boards association. Return ONLY a
JSON array of objects: [{ "district": "...", "approxEnrollment": number|null }].
Include as many public school districts (ISDs, unified/union/consolidated districts)
as you can find. Do not include individual schools or private schools. If exact
enrollment isn't found for a district, use null rather than guessing. Do not include
commentary or markdown, JSON array only.

This is a working browse list, not a certified NCES export, so a partial list is
expected and fine, especially for states with hundreds of small rural districts.
Never refuse to answer or explain why a complete list isn't possible. Always
return the JSON array of whatever districts you did find, even if that's only
the 20-50 largest by enrollment. A partial array is always the correct response;
an empty array or a text explanation is never acceptable.`;

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

// Parses each district object individually rather than requiring the whole
// array to be well-formed — a large state's list can get cut off mid-object
// before Claude finishes writing it, and one truncated trailing object
// shouldn't invalidate every district that parsed fine before it.
function parseDistrictObjects(text) {
  const matches = text.match(/\{[^{}]*\}/g);
  if (!matches) return null;

  const districts = [];
  for (const raw of matches) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.district === "string" && obj.district.trim()) {
        districts.push({
          district: obj.district.trim(),
          approxEnrollment: typeof obj.approxEnrollment === "number" ? obj.approxEnrollment : null,
        });
      }
    } catch {
      // skip a malformed/truncated object instead of failing the whole list
    }
  }

  return districts.length > 0 ? districts : null;
}

export async function listDistricts({ state, refresh = false, runId }) {
  const cache = loadCache();
  const cached = cache[state];

  if (cached && !refresh && isFresh(cached.generated_date)) {
    return { ...cached, source: "cache" };
  }

  const model = modelForStep("pullDistricts");
  const { text, usage } = await callClaudeWithSearch({
    model,
    system: PULL_SYSTEM,
    userContent: `State: ${state}\n\nList public school districts for this state as described in your instructions.`,
    maxTokens: 8000,
  });

  if (runId) {
    logCall({
      runId,
      step: "pullDistricts",
      model,
      tokensIn: usage?.input_tokens,
      tokensOut: usage?.output_tokens,
    });
  }

  const districts = parseDistrictObjects(text);
  if (!districts) throw new Error("Search did not return a parsable district list.");

  const entry = { state, districts, generated_date: new Date().toISOString() };
  cache[state] = entry;
  saveCache(cache);

  return { ...entry, source: "generated" };
}
