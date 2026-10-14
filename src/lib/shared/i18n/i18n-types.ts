// AUTO-GENERATED - DO NOT EDIT
// Run: npm run i18n:types
// Generated: 2026-10-14T20:57:57.021Z
// Keys: 9539

import enMessages from "../../../../messages/en.json";

/** All valid translation keys (9539 keys) */
export type TranslationKey = keyof typeof enMessages;

/** Type-safe message lookup */
export type Messages = typeof enMessages;

/** Check if a key exists */
export function isValidKey(key: string): key is TranslationKey {
  return key in enMessages;
}
