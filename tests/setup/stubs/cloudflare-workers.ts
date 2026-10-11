/**
 * Stand-in for the Worker's `cloudflare:workers` module, which exists only on
 * Cloudflare and under the adapter's `vite dev` proxy. No bindings are set;
 * a test that needs one mocks this module with its own `env`.
 */
export const env: Partial<Cloudflare.Env> = {};
