/**
 * The order of the Hand Motions "which one is this?" round. Shuffled, except
 * that the Static round (both hands stay still) is never first and never
 * comes before three other rounds, while other rounds are left. A round that
 * opens on a still picture confuses (Austen, 2026-11-22).
 */
const STILL = "static";
const OTHERS_BEFORE_STILL = 3;

export function orderQuizRounds<T extends string>(
  unanswered: readonly T[],
  random: () => number = Math.random
): T[] {
  const others = unanswered
    .filter((id) => id !== STILL)
    .map((id) => ({ id, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ id }) => id);
  const still = unanswered.filter((id) => id === STILL);
  if (still.length === 0) return others;
  const earliest = Math.min(OTHERS_BEFORE_STILL, others.length);
  const slots = others.length - earliest + 1;
  const at = earliest + Math.min(slots - 1, Math.floor(random() * slots));
  return [...others.slice(0, at), ...still, ...others.slice(at)];
}
