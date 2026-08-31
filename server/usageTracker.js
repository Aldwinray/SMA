const runs = new Map();

export function startRun(runId, state, totalDistricts) {
  runs.set(runId, { state, calls: [], totalDistricts, escalations: 0 });
}

export function logCall({ runId, step, model, tokensIn = 0, tokensOut = 0 }) {
  const run = runs.get(runId);
  if (!run) return;
  run.calls.push({ step, model, tokensIn, tokensOut, timestamp: new Date().toISOString() });
}

export function logEscalation(runId) {
  const run = runs.get(runId);
  if (!run) return;
  run.escalations += 1;
}

export function checkCeilings(runId) {
  const run = runs.get(runId);
  if (!run) return { ok: true };

  const maxCalls = parseInt(process.env.MAX_CALLS_PER_STATE_RUN || "250", 10);
  const maxEscalationPct = parseInt(process.env.MAX_ESCALATIONS_PER_RUN_PCT || "15", 10);

  if (run.calls.length > maxCalls) {
    return { ok: false, reason: `Run exceeded MAX_CALLS_PER_STATE_RUN (${maxCalls}). Halting.` };
  }

  const escalationPct = run.totalDistricts ? (run.escalations / run.totalDistricts) * 100 : 0;
  if (escalationPct > maxEscalationPct) {
    return {
      ok: false,
      reason: `Ambiguous-match escalation rate (${escalationPct.toFixed(1)}%) exceeded ${maxEscalationPct}%.`,
    };
  }

  return { ok: true };
}

export function getRunSummary(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  const byModel = {};
  for (const c of run.calls) byModel[c.model] = (byModel[c.model] || 0) + 1;
  return { state: run.state, totalCalls: run.calls.length, escalations: run.escalations, callsByModel: byModel };
}