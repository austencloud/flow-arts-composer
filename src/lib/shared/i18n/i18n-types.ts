// AUTO-GENERATED - DO NOT EDIT
// Run: npm run i18n:types
// Generated: 2026-09-26T09:43:35.471Z
// Keys: 7049

import enMessages from "../../../../messages/en.json";

/** All valid translation keys (7049 keys) */
export type TranslationKey = keyof typeof enMessages;

/** Type-safe message lookup */
export type Messages = typeof enMessages;

/** Check if a key exists */
export function isValidKey(key: string): key is TranslationKey {
  return key in enMessages;
}
