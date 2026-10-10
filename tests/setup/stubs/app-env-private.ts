/**
 * Stub for SvelteKit's `$app/env/private` in tests that run without SvelteKit.
 *
 * Every variable is undefined, so no test reaches a real secret or external
 * service from `.env`. A test that needs a value mocks the module with
 * `envModule` from `#test-helpers/env-module.js`.
 */
export {};
