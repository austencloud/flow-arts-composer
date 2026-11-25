// Cosmic's asset URLs, in a module with no loader imports so the main-thread
// scene can share them without pulling the worker's GLTF/KTX2 stack along.

// The lunar outpost built by scripts/build-moon-outpost.py. The export keeps
// its old name because the Composer page prefetches it by that name.
export const COSMIC_RELIQUARY_URL = "/models/cosmic/moon-outpost.glb" as const;

// A 2048x1024 copy of the 5400x2700 original: the Earth is a few hundred
// pixels across on screen, so the full map only cost download and decode.
export const COSMIC_EARTH_TEXTURE_URL =
  "/textures/cosmic/earth-diffuse-2k.jpg" as const;
