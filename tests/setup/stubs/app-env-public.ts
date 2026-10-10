/**
 * Stub for SvelteKit's `$app/env/public` in tests that run without SvelteKit.
 *
 * The app reads it as a namespace (`import * as env from "$app/env/public"`),
 * so every variable is undefined here and its consumer takes the "not
 * configured" path: analytics and maps stay off, which is what a test wants. A
 * test that needs a value mocks the module with `envModule` from
 * `#test-helpers/env-module.js`.
 */
export {};
