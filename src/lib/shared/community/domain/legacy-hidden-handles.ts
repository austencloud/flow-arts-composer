/**
 * Accounts moderated before `isHidden` existed, by handle (lowercase).
 *
 * `scripts/creators/hide-legacy-accounts.mjs --apply` sets `isHidden: true` on
 * their profiles. Until that has run in production, listed-creator.ts also
 * hides them by handle; take that check and this list out once it has.
 * `scripts/creators/email-handles.mjs` never touches these accounts.
 *
 * No imports: the Node scripts load this file directly. Removing a name is a
 * moderation decision, not a cleanup.
 */
export const LEGACY_HIDDEN_HANDLES: readonly string[] = [
  "netsua07",
  "flowtacocat",
  "tka.flowarts",
  "cirqueaflame_603",
  "tkascribe.review",
];
