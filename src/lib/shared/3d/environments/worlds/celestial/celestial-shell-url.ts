/**
 * The Celestial shell model, cache-busted by its `?v=` tag. The worker, the
 * page scene and the pre-tap warm-up (scene-asset-manifest.ts) all read this
 * one constant, so the warmed URL is byte-for-byte the one the scene asks for.
 * Kept in its own file so the page-side manifest can import it without
 * pulling in the world's three.js code.
 */
export const CELESTIAL_SHELL_URL =
  "/models/celestial/sky-citadel.glb?v=citadel-polish-r1";
