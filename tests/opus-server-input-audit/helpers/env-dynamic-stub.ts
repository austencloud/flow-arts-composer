/**
 * `$app/env/private` for the audit suite.
 *
 * Empty by design: no audit test may reach a configured secret or external
 * host, and the handlers under test take their "not configured" branch when a
 * key is absent, which is exactly the isolated behaviour this suite wants.
 * The app reads the module as a namespace, so every name is undefined here.
 */
export {};
