/**
 * Tenure and emptiness, the two things every profile can always answer.
 *
 * Split out of the rail so both are testable without mounting anything. The
 * `activeLabel` null cases in particular are the whole reason this file exists:
 * they encode a data hazard that produced a profile which looked broken, and a
 * component-local ternary would have hidden it.
 */

import { getLocale } from "#lib/shared/i18n/i18n.svelte.js";
import { formatTimeAgo } from "#lib/shared/i18n/i18n-formatters.js";

const monthYearFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * "March 2026" — the month someone joined, in the active locale.
 *
 * Month-and-year rather than a full date because the day is noise: the claim is
 * how long they have been here, not which Tuesday they signed up.
 * `formatDate()` is preset-only (`dateStyle`), so it cannot express this shape;
 * this is the narrow case it does not cover, not a second date library.
 */
export function joinedLabel(joinedDate: Date): string {
  const locale = getLocale();
  let formatter = monthYearFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    });
    monthYearFormatters.set(locale, formatter);
  }
  return formatter.format(joinedDate);
}

/**
 * "3 days ago", or `null` when there is nothing honest to say.
 *
 * Two distinct absences collapse to the same answer:
 *
 * 1. **No activity recorded.** `lastActivityDate` is missing on real accounts —
 *    the creators directory has a live "never returned" branch for exactly this
 *    (`CreatorCell.svelte`). It must not be rendered as activity.
 * 2. **Activity equals the join date.** Carries no information beyond "Joined
 *    <month>", which the line above it already says. Rendering both produced
 *    "Member since July 2026 / Active July 2026" — the failure this guards.
 *
 * The second check is deliberately kept even after `getUserProfile` stopped
 * substituting `joinedDate`: a genuine first-session write lands on the join
 * instant too, and the redundancy reads the same to a viewer either way.
 */
export function activeLabel(
  lastActiveAt: Date | null | undefined,
  joinedDate: Date
): string | null {
  if (!lastActiveAt) return null;
  if (lastActiveAt.getTime() === joinedDate.getTime()) return null;
  return formatTimeAgo(lastActiveAt);
}

/**
 * Whether a profile has anything to show in its work column.
 *
 * The work column is dropped entirely when this is false, so the empty profile
 * is a complete small page rather than a composed page with a hole in it. Every
 * band counts: a visitor sees `collections: 0` regardless (saved art is
 * owner-only by Firestore rule), which is correct — for them the collections
 * are not empty, they are not theirs to read.
 */
export function hasProfileWork(counts: {
  showcase: number;
  sequences: number;
  collections: number;
}): boolean {
  return (
    counts.showcase > 0 || counts.sequences > 0 || counts.collections > 0
  );
}
