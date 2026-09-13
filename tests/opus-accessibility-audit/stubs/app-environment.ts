/**
 * Audit-local `$app/environment` stub.
 *
 * The shared stub at tests/setup/stubs/app-environment.ts reports
 * `browser === false`, which makes the app's browser-only service getters
 * (`getKeyboardShortcutManager`, `getEscapeLayerManager`, ...) throw. These
 * specs deliberately run the real keyboard/escape stack inside a real Chromium
 * page, so this audit-owned copy reports the truth for that environment.
 *
 * Owned by tests/opus-accessibility-audit; the shared stub is untouched.
 */
export const browser = true;
export const dev = true;
export const building = false;
export const version = "test";
