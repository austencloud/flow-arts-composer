import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { variables } from "../../src/env";

// The native (Capacitor) bundle has no Worker behind it, so it cannot fetch
// /_app/env.js, where SvelteKit serves dynamic public variables. Anything the
// WebView needs at startup must be declared static in src/env.ts, which inlines
// it at build time.
const NATIVE_STARTUP_VARIABLES = [
  "PUBLIC_POSTHOG_KEY",
  "PUBLIC_POSTHOG_HOST",
  "PUBLIC_POSTHOG_PROJECT_ID",
  "PUBLIC_GOOGLE_MAPS_API_KEY",
] as const;

describe("Capacitor environment contract", () => {
  it("embeds PostHog and Maps settings without requesting /_app/env.js", () => {
    for (const name of NATIVE_STARTUP_VARIABLES) {
      expect(variables[name], name).toMatchObject({
        public: true,
        static: true,
      });
    }

    const source = readFileSync(
      resolve(process.cwd(), "src/lib/shared/analytics/services/posthog.ts"),
      "utf8"
    );
    expect(source).toContain('from "$app/env/public"');
    expect(source).not.toContain('import("$app/env');
  });

  it("keeps map screens on the shared static Maps key", () => {
    const clientFiles = [
      "src/lib/features/admin/components/ActiveUsersPanel.svelte",
      "src/lib/features/choreo-card/components/scan-activity/ScanActivityTab.svelte",
      "src/lib/features/community/Community.svelte",
      "src/lib/features/community/get-geocoding-service.ts",
      "src/lib/features/festivals/components/map/FestivalMap.svelte",
    ];

    for (const file of clientFiles) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source, file).toContain(
        '"#lib/shared/maps/google-maps-api-key.js"'
      );
      expect(source, file).not.toContain("$app/env/public");
    }
  });
});
