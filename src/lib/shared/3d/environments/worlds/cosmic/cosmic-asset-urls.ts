// Cosmic's asset URLs, in a module with no loader imports so the main-thread
// scene can share them without pulling the worker's GLTF/KTX2 stack along.

export const COSMIC_RELIQUARY_URL =
  "/models/cosmic/cosmic-reliquary.glb" as const;

// A 2048x1024 copy of the 5400x2700 original: the earth is a radius-8 sphere
// about 72 units from the stage, a few hundred pixels on screen, so the full
// map only cost download (2.5 MB) and decode.
export const COSMIC_EARTH_TEXTURE_URL =
  "/textures/cosmic/earth-diffuse-2k.jpg" as const;
