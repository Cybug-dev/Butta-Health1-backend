/**
 * Curated, deterministic urgent-symptom detection. This intentionally does not
 * depend on model output: a model can be wrong, refuse, or time out, but this
 * check must still run so an extraction is never silently downgraded from an
 * urgent presentation. Matches add fixed advisory metadata only — never a
 * diagnosis, and never a treatment recommendation.
 */

export const URGENT_ADVISORY =
  'This description includes wording associated with potentially urgent symptoms. '
  + 'Butta Health does not diagnose. If this is a medical emergency, contact local '
  + 'emergency services or seek in-person care now.';

const URGENT_PATTERNS: RegExp[] = [
  /chest (pain|pressure|tightness)/i,
  /can'?t breathe|difficulty breathing|shortness of breath/i,
  /(suicidal|kill myself|end my life|want to die)/i,
  /stroke|face drooping|slurred speech|sudden numbness/i,
  /(severe|worst) headache of my life/i,
  /coughing (up )?blood|vomiting blood/i,
  /unconscious|unresponsive|not breathing/i,
  /severe allergic reaction|anaphylaxis|throat (closing|swelling)/i,
  /seizure/i,
  /overdose/i,
];

export function detectUrgentSymptoms(observation: string): boolean {
  return URGENT_PATTERNS.some((pattern) => pattern.test(observation));
}
