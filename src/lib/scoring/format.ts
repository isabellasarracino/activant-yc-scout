/**
 * Every score in this app — composite or per-dimension — is out of 10.
 * Shown as "7/10" for a whole number, "6.8/10" when there's a real
 * fractional value (composite scores are weighted averages of the
 * per-dimension scores, so fractions are common and meaningful — rounding
 * them all to whole numbers would lose real distinctions, e.g. 6.8 vs 7.2).
 */
export function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10; // guards against float artifacts like 6.999999999
  const display = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  return `${display}/10`;
}
