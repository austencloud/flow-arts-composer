import * as staticPublicEnv from "$app/env/public";

// The maps key is optional in preview builds. src/env.ts declares it static,
// so Capacitor builds embed it when it is configured.
const publicEnv = staticPublicEnv as Record<string, string | undefined>;

export const PUBLIC_GOOGLE_MAPS_API_KEY =
  publicEnv.PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
