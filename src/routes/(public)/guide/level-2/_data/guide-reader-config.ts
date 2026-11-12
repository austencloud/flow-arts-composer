/**
 * LEVEL2_READER_CONFIG - the Level-2 seam for the shared GuideReader (see
 * level-1/_data/guide-reader-config.ts). Renders Level2Document + BUILT2 with a
 * level-2 side nav; the level-1-only deep-link / QR-scan / codex machinery is
 * off (Level 2 has no /learn/guide/<slug> deep-link map or interactive Codex
 * sheet yet), so those features cleanly no-op rather than mis-resolving against
 * the level-1 slug tables.
 */
import type { GuideReaderConfig } from "../../level-1/_data/guide-reader-config";
import Level2Document from "../_components/Level2Document.svelte";
import { BUILT2 } from "./built-pages";
import { LEVEL2_BODY_PAGES } from "./guide-manifest";
import { buildLevel2ReaderNav, FRONT_MATTER_COUNT_2, READER_PAGE_COUNT_2 } from "./guide-reader-nav-2";

export const LEVEL2_READER_CONFIG: GuideReaderConfig = {
  document: Level2Document,
  built: BUILT2,
  bodyPages: LEVEL2_BODY_PAGES,
  frontMatterCount: FRONT_MATTER_COUNT_2,
  readerPageCount: READER_PAGE_COUNT_2,
  navRows: buildLevel2ReaderNav(BUILT2),
  // No level-2 deep-link route; nav rows scroll in-pane (left-click), and the
  // href is only a right-click/middle-click affordance - keep it inert.
  hrefFor: () => "#",
  levelLabel: "Level 2",
  enableDeepLinks: false,
};
