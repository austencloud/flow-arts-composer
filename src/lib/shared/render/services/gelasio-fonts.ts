/**
 * Gelasio — an OFL, metric-compatible Georgia substitute — loaded into a
 * FontFaceSet so card step labels + footer text render identically on the main
 * thread and the composition worker. System serifs (Georgia/Cambria) cannot load
 * in a worker (Chrome blocks local() fonts for fingerprinting), so a bundled
 * woff2 is the only way to make the two renders pixel-match — and it also makes
 * the printed card deterministic on machines without those system fonts.
 *
 * Both render paths put "Gelasio" first in their serif font stacks; whichever
 * thread the render runs on resolves to this same loaded face.
 */

const FACES = [
  { weight: "400", path: "/fonts/gelasio/gelasio-latin-400-normal.woff2" },
  { weight: "700", path: "/fonts/gelasio/gelasio-latin-700-normal.woff2" },
];

/**
 * Load the Gelasio faces into the given FontFaceSet (document.fonts on the main
 * thread, self.fonts in a worker). Resolves the woff2 path against the current
 * location so the absolute `/fonts/...` works in both scopes.
 */
export async function loadGelasioInto(fonts: FontFaceSet): Promise<void> {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin ?? "";
  await Promise.all(
    FACES.map(async ({ weight, path }) => {
      const url = origin + path;
      const face = new FontFace("Gelasio", `url(${url})`, { weight, style: "normal" });
      await face.load();
      fonts.add(face);
    }),
  );
}

let mainLoad: Promise<void> | null = null;

/**
 * MAIN THREAD: load Gelasio into document.fonts once (cached). No-op in a worker
 * (no document) — the worker seeds its own self.fonts at init.
 */
export function ensureCardFonts(): Promise<void> {
  if (mainLoad) return mainLoad;
  const doc = (globalThis as { document?: { fonts?: FontFaceSet } }).document;
  if (!doc?.fonts) return Promise.resolve();
  mainLoad = loadGelasioInto(doc.fonts);
  return mainLoad;
}
