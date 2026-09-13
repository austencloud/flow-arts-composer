/**
 * `$app/environment` for the audit suite.
 *
 * `browser: false` is the real server condition. `dev: true` is what a running
 * `vite dev` server reports, which is the only condition under which the
 * dev-guarded write endpoints execute their bodies at all — the audit needs
 * them to run in order to observe what they do with unvalidated input.
 */
export const browser = false;
export const dev = true;
export const building = false;
export const version = "audit";
