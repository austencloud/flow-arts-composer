// The Worker module adapter-cloudflare 8 serves bindings through (see
// src/lib/server/cloudflare/worker-env.ts). `wrangler types` would generate
// this together with the whole Workers runtime as global types for every
// file, browser code included; the app reads only `env`, typed by
// `Cloudflare.Env` in app.d.ts.
declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
