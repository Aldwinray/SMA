export const MODELS = {
  FAST: "claude-haiku-4-5-20251001",
  MID: "claude-sonnet-5",
  REASONING: "claude-opus-5",
};

export const STEP_MODEL = {
  pullDistricts: MODELS.FAST,
  suppressionBulk: MODELS.FAST,
  suppressionAmbiguous: MODELS.REASONING,
  scoreCategory: MODELS.FAST,
  synthesizeTier: MODELS.MID,
  findContacts: MODELS.FAST,
  stateMemo: MODELS.REASONING,
};

export function modelForStep(step) {
  const model = STEP_MODEL[step];
  if (!model) {
    throw new Error(`No model mapping found for step "${step}". Add it to STEP_MODEL.`);
  }
  return model;
}