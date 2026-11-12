/**
 * GuideReaderConfig - the level seam for the shared GuideReader shell. The reader
 * is otherwise a generic "render a manifest's BUILT pages as a fit-to-pane
 * scroller with side nav + click-to-animate companion"; this bundle carries the
 * per-level specifics (which document, which pages, which nav, whether the
 * level-1-only deep-link machinery is live) so Level 1 and Level 2
 * share one reader instead of forking it (never-hand-roll).
 *
 * LEVEL1_READER_CONFIG is the default - passing no `config` to GuideReader keeps
 * its historical Level-1 behavior byte-for-byte.
 */
import type { Component } from "svelte";
import type { ReaderNavRow } from "./guide-reader-nav";
import GuideDocument from "../_components/GuideDocument.svelte";
import { BUILT } from "./built-pages";
import { GUIDE_BODY_PAGES } from "./guide-manifest";
import { buildReaderNav, FRONT_MATTER_COUNT, READER_PAGE_COUNT } from "./guide-reader-nav";
import { hrefForIndex } from "./guide-page-links";

/** The minimal page shape the reader reads off the active manifest entry. */
export type ReaderBodyPage = { id: string; title: string };

export type GuideReaderConfig = {
  /** The ordered-page-sequence document (GuideDocument / Level2Document). Typed
   *  loosely (`Component<any>`) because the reader is what knows the props to
   *  feed it (page snippet, built, frame) - the two documents differ in props. */
  document: Component<any>;
  /** Built per-page components keyed by manifest id. */
  built: Record<string, Component>;
  /** Body-page entries in manifest order (index math + codex/companion labels). */
  bodyPages: readonly ReaderBodyPage[];
  /** Unnumbered front-matter pages rendered before body page 0. */
  frontMatterCount: number;
  /** Total reader pages = front matter + body. */
  readerPageCount: number;
  /** Prebuilt side-nav rows (front jumps + grouped body pages). */
  navRows: ReaderNavRow[];
  /** Real href for a nav row (right-click/middle-click); left-click scrolls.
   *  May be null (no deep-link target - the row is scroll-only). */
  hrefFor: (index: number) => string | null;
  /** Copy-for-AI header prefix, e.g. "Level 1". */
  levelLabel: string;
  /** Level-1-only URL deep-link sync + QR scan-intent handoff. */
  enableDeepLinks: boolean;
};

export const LEVEL1_READER_CONFIG: GuideReaderConfig = {
  document: GuideDocument,
  built: BUILT,
  bodyPages: GUIDE_BODY_PAGES,
  frontMatterCount: FRONT_MATTER_COUNT,
  readerPageCount: READER_PAGE_COUNT,
  navRows: buildReaderNav(BUILT),
  hrefFor: hrefForIndex,
  levelLabel: "Level 1",
  enableDeepLinks: true,
};
