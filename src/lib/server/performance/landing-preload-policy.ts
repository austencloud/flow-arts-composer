export interface PreloadAsset {
  type: "font" | "css" | "js" | "asset";
  path: string;
}

export interface PageChunk {
  html: string;
  done: boolean;
}

/**
 * CSS owners that are reachable from `/` only through a lazy component or an
 * interaction-owned surface. SvelteKit includes their styles in the route
 * manifest so Vite can load them with the dynamic import, but preloading them
 * in the initial HTML spends the landing page's bandwidth before they mount.
 */
const DEFERRED_HOME_STYLES = [
  "AlphabetMarquee.",
  "AnimatorCanvas.",
  "AvatarImage.",
  "BackgroundHost.",
  "BookCoverArt.",
  "BpmChips.",
  "BrowseModule.",
  "CheckerboardCircleIcon.",
  "ChoreoCard.",
  "CollectionChipsRow.",
  "ContextMenu.",
  "DifficultyBadge.",
  "founding-collections.",
  "GlossaryDictionaryCard.",
  "GuideCover.",
  "InlineAnimationPlayer.",
  "LegalSheet.",
  "LessonGridDisplay.",
  "LOOPIconStrip.",
  "PanelSpinner.",
  "PanelState.",
  "PictographFadeCard.",
  "PrivacyPolicyContent.",
  "ProgressRing.",
  "RobustAvatar.",
  "StepNumber.",
  "TKAWordGlyph.",
  "UnifiedTimeline.",
  "vendor.",
  "WordHeader.",
] as const;

/**
 * Keep SvelteKit's default preload behavior everywhere except the homepage's
 * lazy-only CSS. The omitted styles remain attached to their dynamic import
 * and are fetched before that component mounts.
 */
export function shouldPreloadRouteAsset(
  pathname: string,
  asset: PreloadAsset
): boolean {
  if (pathname !== "/" || asset.type !== "css") return true;
  return !DEFERRED_HOME_STYLES.some((owner) => asset.path.includes(owner));
}

function isDeferredHomeStylesheetTag(tag: string): boolean {
  if (!/\brel=(?:"stylesheet"|'stylesheet')/i.test(tag)) return false;
  return DEFERRED_HOME_STYLES.some((owner) => tag.includes(owner));
}

/**
 * SvelteKit's preload callback controls Link headers, but it intentionally
 * emits every route-reachable stylesheet in the HTML. Remove only lazy-owner
 * links from the homepage; Vite attaches them to their dynamic import and
 * restores them before the deferred component mounts.
 */
export function stripDeferredHomeStylesheets(html: string): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) =>
    isDeferredHomeStylesheetTag(tag) ? "" : tag
  );
}

/**
 * The application shell carries theme restoration, cache maintenance, PWA
 * splash metadata, and a progress screen. None of it participates in the
 * homepage's first useful paint. Keep those blocks intact for every app/public
 * route that needs them, but remove explicitly marked blocks from `/`.
 */
export function stripRootAppOnlyBlocks(html: string): string {
  return html.replace(
    /<!--\s*tka-root-app-only:start\s*-->[\s\S]*?<!--\s*tka-root-app-only:end\s*-->/gi,
    ""
  );
}

/**
 * SvelteKit may stream HTML through multiple transform calls. Buffer the
 * prerendered homepage so a split link tag cannot evade the stylesheet filter.
 */
export function createLandingPageTransformer(
  pathname: string
): (chunk: PageChunk) => string {
  if (pathname !== "/") return ({ html }) => html;

  let bufferedHtml = "";
  return ({ html, done }) => {
    bufferedHtml += html;
    if (!done) return "";

    const transformed = stripRootAppOnlyBlocks(
      stripDeferredHomeStylesheets(bufferedHtml)
    );
    bufferedHtml = "";
    return transformed;
  };
}
