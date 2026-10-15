// AUTO-GENERATED - DO NOT EDIT
// Run: npm run i18n:types
// Generated: 2026-10-15T00:06:12.353Z
// Keys: 9591

import enMessages from "../../../../messages/en.json";

/** All valid translation keys (9591 keys) */
export type TranslationKey = keyof typeof enMessages;

/** Type-safe message lookup */
export type Messages = typeof enMessages;

/** Check if a key exists */
export function isValidKey(key: string): key is TranslationKey {
  return key in enMessages;
}
