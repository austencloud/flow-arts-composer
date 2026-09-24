/**
 * Level 2 guide — per-topic crawlable route manifest. Mirrors level-1's
 * `guide-manifest.ts` + `guide-page-seo.ts` ([slug] route + `seoForSlug`),
 * but built from the LIVE `_sections/ch20` / `_sections/ch21` components that
 * `/guide/level-2/turns` and `/guide/level-2/double-turns` already render —
 * NOT from `LEVEL2_BODY_PAGES` (that manifest drives the print/book PDF
 * pagination, which intentionally reserves one physical page per topic even
 * before its diagrams are built; the live component tree has fewer, denser
 * sections).
 *
 * The mapping (see docs/superpowers/specs/2026-07-13-level-2-guide-rebuild-tracker.md
 * for the print-page numbering this cross-references):
 *
 *  - `turn-shifts`, `turns-dashes-static`, `glyphs-pads`, `s-and-t`,
 *    `opening-closing`, `one-one-turns` are each already a substantial,
 *    self-contained section (150-340 lines of Austen's prose) — one route
 *    each, exactly like level-1's per-topic granularity. `turns-dashes-static`
 *    combines TurnDashes.svelte + TurnStatic.svelte, reusing the SAME merge
 *    LEVEL2_BODY_PAGES already made for the print page ("Dashes / Static",
 *    id turns-dash-static) rather than inventing a new split.
 *  - `types-1-6-turns` combines Type1Turns..Type6Turns.svelte: six ~40-line
 *    fragments, each just a short paragraph plus TODO diagram placeholders
 *    (no built figures yet) — print-sheet fragments too thin to stand alone
 *    (autonomy-and-completeness / this task's own instruction). The print
 *    manifest gives each its own physical page (a print layout reserves the
 *    space regardless), but as a web route six near-duplicate stub pages
 *    would hurt more than help; one combined page carries all six headings.
 *  - `double-turn-shifts`, `double-turn-dashes` are substantial, standalone.
 *  - `double-turn-static` also carries CodexPages.svelte (`codex-pages`
 *    section id) appended at the end: CodexPages is a one-sentence stub with
 *    two TODO placeholders (no codex grids built yet) — too thin for its own
 *    route, so it rides along on the chapter's last topic instead of shipping
 *    an near-empty page.
 *
 * Every original `LEVEL2_SECTION_ANCHORS` id keeps working as a same-page
 * anchor: single-section pages reuse their section's own id as the route
 * slug (`turn-shifts` → #turn-shifts), and merged pages keep every source
 * id as an in-page anchor (`ANCHOR_ROUTE_SLUG` below resolves both).
 */
import type { Component } from "svelte";
import TurnShifts from "../_sections/ch20/TurnShifts.svelte";
import TurnDashes from "../_sections/ch20/TurnDashes.svelte";
import TurnStatic from "../_sections/ch20/TurnStatic.svelte";
import GlyphsPADS from "../_sections/ch20/GlyphsPADS.svelte";
import Type1Turns from "../_sections/ch20/Type1Turns.svelte";
import Type2Turns from "../_sections/ch20/Type2Turns.svelte";
import Type3Turns from "../_sections/ch20/Type3Turns.svelte";
import Type4Turns from "../_sections/ch20/Type4Turns.svelte";
import Type5Turns from "../_sections/ch20/Type5Turns.svelte";
import Type6Turns from "../_sections/ch20/Type6Turns.svelte";
import SandT from "../_sections/ch20/SandT.svelte";
import OpeningClosing from "../_sections/ch20/OpeningClosing.svelte";
import OneOneTurns from "../_sections/ch20/OneOneTurns.svelte";
import DoubleTurnShifts from "../_sections/ch21/DoubleTurnShifts.svelte";
import DoubleTurnDashes from "../_sections/ch21/DoubleTurnDashes.svelte";
import DoubleTurnStatic from "../_sections/ch21/DoubleTurnStatic.svelte";
import CodexPages from "../_sections/ch21/CodexPages.svelte";

export type Level2Chapter = "turns" | "double-turns";

export type Level2TopicPage = {
  /** Route slug: /guide/level-2/<slug>. */
  slug: string;
  /** Which hub this topic belongs to (breadcrumb + prev/next grouping). */
  chapter: Level2Chapter;
  /** On-page <h1> — built from the chapter's LEVEL2_GROUP_TITLES + the
   *  section(s)' own GuideSection `title` prop(s). Never invented copy. */
  h1: string;
  /** <title> / og:title. */
  title: string;
  /** meta description / og:description — Austen's own opening sentence(s),
   *  verbatim, lifted from the section component that leads the page. */
  description: string;
  /** GuideSection components rendered on this route, in order. Each keeps
   *  painting its own id + h2 (and h3 subtitle where set). */
  sections: Component[];
  /** Every `<GuideSection id="...">` id covered by this route (for the
   *  anchor → slug lookup below). */
  anchorIds: string[];
};

export const LEVEL2_TOPIC_PAGES: Level2TopicPage[] = [
  // ── 1-Turns (chapter: turns) ──────────────────────────────────────────
  {
    slug: "turn-shifts",
    chapter: "turns",
    h1: "1-Turns: Shifts",
    title: "1-Turns: Shifts · Level 2 · Flow Arts Notation Guide",
    description:
      "A turn is a 180° rotation that occurs during a motion. Let's add a single turn to a shift.",
    sections: [TurnShifts],
    anchorIds: ["turn-shifts"],
  },
  {
    slug: "turns-dashes-static",
    chapter: "turns",
    h1: "1-Turns: Dashes / Static",
    title: "1-Turns: Dashes / Static · Level 2 · Flow Arts Notation Guide",
    description:
      "You can also add a turn to a dash. During the prop rotation, move the hand directly in a straight line.",
    sections: [TurnDashes, TurnStatic],
    anchorIds: ["turn-dashes", "turn-static"],
  },
  {
    slug: "glyphs-pads",
    chapter: "turns",
    h1: "Glyphs / PADS",
    title: "Glyphs / PADS · Level 2 · Flow Arts Notation Guide",
    description:
      "A glyph is a letter combined with other characters, such as numbers or symbols.",
    sections: [GlyphsPADS],
    anchorIds: ["glyphs-pads"],
  },
  {
    slug: "types-1-6-turns",
    chapter: "turns",
    h1: "1-Turns: Types 1–6",
    title: "1-Turns: Types 1–6 · Level 2 · Flow Arts Notation Guide",
    description:
      "When motion types are exactly the same, put left in the high slot and right in the low slot.",
    sections: [
      Type1Turns,
      Type2Turns,
      Type3Turns,
      Type4Turns,
      Type5Turns,
      Type6Turns,
    ],
    anchorIds: [
      "type-1-turns",
      "type-2-turns",
      "type-3-turns",
      "type-4-turns",
      "type-5-turns",
      "type-6-turns",
    ],
  },
  {
    slug: "s-and-t",
    chapter: "turns",
    h1: "S and T",
    title: "S and T · Level 2 · Flow Arts Notation Guide",
    description:
      "S and T are a different type of hybrid. Even though their motions are a matching shift type (pro|pro, anti|anti), each has one hand leading and the other following.",
    sections: [SandT],
    anchorIds: ["s-and-t"],
  },
  {
    slug: "opening-closing",
    chapter: "turns",
    h1: "Opening / Closing",
    title: "Opening / Closing · Level 2 · Flow Arts Notation Guide",
    description:
      "Because of Gamma's asymmetry, Λ (Lam) presents an extra variation when adding a turn.",
    sections: [OpeningClosing],
    anchorIds: ["opening-closing"],
  },
  {
    slug: "one-one-turns",
    chapter: "turns",
    h1: "1|1 Turns",
    title: "1|1 Turns · Level 2 · Flow Arts Notation Guide",
    description:
      "For a turn on both props, add a \"1\" in both the high and the low slot. This can also be written as 1|1.",
    sections: [OneOneTurns],
    anchorIds: ["one-one-turns"],
  },

  // ── 2-Turns (chapter: double-turns) ───────────────────────────────────
  {
    slug: "double-turn-shifts",
    chapter: "double-turns",
    h1: "2-Turns: Shifts",
    title: "2-Turns: Shifts · Level 2 · Flow Arts Notation Guide",
    description: "2 turns add a 360 degree rotation to a motion.",
    sections: [DoubleTurnShifts],
    anchorIds: ["double-turn-shifts"],
  },
  {
    slug: "double-turn-dashes",
    chapter: "double-turns",
    h1: "2-Turns: Dashes",
    title: "2-Turns: Dashes · Level 2 · Flow Arts Notation Guide",
    description:
      "Now let's add a double turn to a dash. It's relatively complex, so we'll break it down into four parts.",
    sections: [DoubleTurnDashes],
    anchorIds: ["double-turn-dashes"],
  },
  {
    slug: "double-turn-static",
    chapter: "double-turns",
    h1: "2-Turns: Static / Codex Pages",
    title: "2-Turns: Static / Codex Pages · Level 2 · Flow Arts Notation Guide",
    description:
      "A static motion with 2 turns is simply a 360° turn in place. It's necessary to use negative space or a turn to achieve this.",
    sections: [DoubleTurnStatic, CodexPages],
    anchorIds: ["double-turn-static", "codex-pages"],
  },
];

/** Anchor id (a live `<GuideSection id="...">`) → the route slug that now
 *  hosts it. Used by GuideSidebar to link straight to a topic route instead
 *  of the old `/guide/level-2/turns#<id>` / `/guide/level-2/double-turns#<id>`
 *  in-page anchors, now that the sections live on their own routes. */
export const LEVEL2_ANCHOR_ROUTE_SLUG: Record<string, string> =
  Object.fromEntries(
    LEVEL2_TOPIC_PAGES.flatMap((p) => p.anchorIds.map((id) => [id, p.slug]))
  );

export function level2TopicPageForSlug(slug: string): Level2TopicPage | undefined {
  return LEVEL2_TOPIC_PAGES.find((p) => p.slug === slug);
}

/** The topic pages of one chapter, in reading order (for that chapter's hub
 *  links and for prev/next within the chapter). */
export function level2TopicPagesForChapter(
  chapter: Level2Chapter
): Level2TopicPage[] {
  return LEVEL2_TOPIC_PAGES.filter((p) => p.chapter === chapter);
}
