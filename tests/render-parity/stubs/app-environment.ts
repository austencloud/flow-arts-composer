// $app/env stub for the render-parity project. Unlike the shared
// tests/setup/stubs stub (browser: false, for jsdom-ish component logic),
// this project drives the real render pipeline in real Chromium — modules
// that gate initialization on `browser` must take their browser path.
export const browser = true;
export const dev = true;
export const building = false;
export const version = "render-parity";
