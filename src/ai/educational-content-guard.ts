/**
 * Deterministic guard against diagnostic or prescriptive phrasing in
 * model-generated educational context. This does not depend on the model
 * following instructions correctly: any bullet matching these patterns is
 * dropped rather than trusted, because "you have X" / "take Y" language is
 * exactly the diagnosis-and-treatment behavior this product must never show,
 * regardless of how the prompt was worded.
 */

const DIAGNOSTIC_PATTERNS: RegExp[] = [
  /\byou (have|are (experiencing|suffering|likely))\b/i,
  /\byour (condition|diagnosis)\b/i,
  /\bthis (is|means) (likely|probably)?\s*(a|an)\b/i,
  /\byou should (take|use|try)\b/i,
  /\bi (recommend|suggest|advise)\b/i,
  /\b(take|use)\s+\d/i, // dosage-shaped phrasing, e.g. "take 400mg"
  /\bprescri(be|ption)\b/i,
];

export function sanitizeEducationalContext(bullets: string[]): string[] {
  return bullets.filter((bullet) => !DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(bullet)));
}
