import { defineEnvVars } from "@sveltejs/kit/env";

// Every variable here is optional, as it was under the old `$env/*` modules:
// an unset value stays `undefined` instead of failing startup, and each caller
// keeps its own fallback.
const optional = (value: string | undefined) => value;

/**
 * Environment variables for `$app/env/private` and `$app/env/public`.
 *
 * Dynamic values are read when the app starts — from the Worker's environment
 * on Cloudflare, and from `.env` in development. Static values are inlined at
 * build time; the PostHog and Maps keys are static because the native
 * (Capacitor) bundle has no Worker to read them from.
 */
export const variables = defineEnvVars({
  // Server only
  FIREBASE_SERVICE_ACCOUNT_JSON: { schema: optional },
  POSTHOG_PERSONAL_API_KEY: { schema: optional },
  POSTHOG_PROJECT_ID: { schema: optional },
  POSTHOG_API_HOST: { schema: optional },
  FEEDBACK_INGEST_KEY: { schema: optional },
  ANTHROPIC_API_KEY: { schema: optional },
  DEEPSEEK_API_KEY: { schema: optional },
  TIKA_DIRECTOR_MODEL: { schema: optional },
  TIKA_DIRECTOR_REVIEWER: { schema: optional },
  OLLAMA_BASE_URL: { schema: optional },

  // Public, read at runtime
  PUBLIC_ENVIRONMENT: { public: true, schema: optional },
  PUBLIC_FIREBASE_PROJECT_ID: { public: true, schema: optional },
  PUBLIC_USE_FIREBASE_EMULATORS: { public: true, schema: optional },
  PUBLIC_FIREBASE_EMULATOR_PROJECT_ID: { public: true, schema: optional },
  PUBLIC_APP_LAUNCHED: { public: true, schema: optional },
  PUBLIC_APP_STORE_URL: { public: true, schema: optional },
  PUBLIC_PLAY_STORE_URL: { public: true, schema: optional },

  // Public, inlined at build time
  PUBLIC_POSTHOG_KEY: { public: true, static: true, schema: optional },
  PUBLIC_POSTHOG_HOST: { public: true, static: true, schema: optional },
  PUBLIC_POSTHOG_PROJECT_ID: { public: true, static: true, schema: optional },
  PUBLIC_GOOGLE_MAPS_API_KEY: { public: true, static: true, schema: optional },
});
