/**
 * The GuideSection components each Level 2 topic route renders, keyed by the
 * slugs in `level2-topic-routes.ts` (see that file for the section → route
 * mapping and why some sections share a page). Kept apart from the page data
 * because these components pull in the animation player and app state; only
 * the page that actually renders a topic should import them.
 *
 * Each list is in render order, and each component keeps painting its own
 * id + h2 (and h3 subtitle where set). guide-level-2-topic-pages-contract.test.ts
 * checks from this file's source that every topic slug has at least one
 * section, so the test never has to import the components.
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

export const LEVEL2_TOPIC_SECTIONS: Readonly<
  Record<string, readonly Component[]>
> = {
  // ── 1-Turns (chapter: turns) ──────────────────────────────────────────
  "turn-shifts": [TurnShifts],
  "turns-dashes-static": [TurnDashes, TurnStatic],
  "glyphs-pads": [GlyphsPADS],
  "types-1-6-turns": [
    Type1Turns,
    Type2Turns,
    Type3Turns,
    Type4Turns,
    Type5Turns,
    Type6Turns,
  ],
  "s-and-t": [SandT],
  "opening-closing": [OpeningClosing],
  "one-one-turns": [OneOneTurns],

  // ── 2-Turns (chapter: double-turns) ───────────────────────────────────
  "double-turn-shifts": [DoubleTurnShifts],
  "double-turn-dashes": [DoubleTurnDashes],
  "double-turn-static": [DoubleTurnStatic, CodexPages],
};
