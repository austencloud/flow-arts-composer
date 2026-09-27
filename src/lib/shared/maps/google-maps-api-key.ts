import * as staticPublicEnv from "$env/static/public";

// The maps key is optional in preview builds. A namespace import still embeds
// the key in Capacitor builds when it is configured.
const publicEnv = staticPublicEnv as Record<string, string | undefined>;

export const PUBLIC_GOOGLE_MAPS_API_KEY =
  publicEnv.PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
