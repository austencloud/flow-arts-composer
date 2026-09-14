/**
 * Text Renderer for MCP Server
 *
 * Delegates header, footer, badge, and LOOP icon rendering to
 * @tka/render-composition for visual parity with the app.
 *
 * Keeps:
 * - LOOPComponent enum (used by callers)
 * - ensureFontsRegistered() (Node.js canvas needs explicit font registration)
 * - Contextual captions / humor profile (MCP-specific feature)
 */

import { type CanvasRenderingContext2D } from "@napi-rs/canvas/node-canvas.js";
import {
  renderHeader as sharedRenderHeader,
  renderFooter as sharedRenderFooter,
  calculateHeaderHeight as sharedCalculateHeaderHeight,
  calculateFooterHeight as sharedCalculateFooterHeight,
  type HeaderOptions,
  type FooterOptions,
  type LOOPComponentId,
  type CompressedSegment,
  type LoopInversionPeriod,
  type LoopReflectionAxis,
  type LoopRotationPeriod,
  type LetterStyle as SharedLetterStyle,
} from "@tka/render-composition";
import { loadTkaGlyphImages } from "./tka-glyph-image-loader.js";
import { ensureGelasioRegistered } from "./gelasio-fonts.js";

export function ensureFontsRegistered(): void {
  ensureGelasioRegistered();
}

export interface TextRenderOptions {
  darkMode: boolean;
  margin?: number;
}

export interface UserExportInfo {
  userName?: string;
  notes?: string;
  birthday?: Date;
  /** The word being rendered - used for contextual captions */
  word?: string;
}

/**
 * Letter styling info for rendering the header with bridge/derived letters grayed out
 */
export interface LetterStyle {
  letter: string;
  isBridge: boolean;
  /** Whether this letter is derived from LOOP transformation (dimmed like bridges) */
  isDerived?: boolean;
}

import { LOOPComponent } from "@tka/sequence-engine/loop";
export { LOOPComponent };

/**
 * Render word header at the top of a canvas.
 * Delegates to @tka/render-composition for visual parity with the app.
 *
 * Same signature as before — callers don't need to change.
 */
export async function renderWordHeader(
  ctx: CanvasRenderingContext2D,
  word: string,
  canvasWidth: number,
  headerHeight: number,
  difficultyLevel: number = 1,
  showDifficultyBadge: boolean = true,
  darkMode: boolean = true,
  letterStyles?: LetterStyle[],
  loopComponents?: LOOPComponent[],
  rotationPeriod?: LoopRotationPeriod,
  inversionPeriod?: LoopInversionPeriod,
  reflectionAxis?: LoopReflectionAxis,
  overlayComponents?: LOOPComponent[],
  compressedSegments?: CompressedSegment[],
  indicatorSizeScale?: number
): Promise<void> {
  ensureFontsRegistered();
  const glyphImages = await loadTkaGlyphImages(word, darkMode);

  // Convert MCP LetterStyle[] to shared package LetterStyle[]
  const sharedLetterStyles: SharedLetterStyle[] | undefined = letterStyles?.map(
    (ls) => ({
      letter: ls.letter,
      dimmed: ls.isBridge || !!ls.isDerived,
    })
  );

  // Convert LOOPComponent[] to Set<LOOPComponentId>
  const loopSet: Set<LOOPComponentId> | undefined =
    loopComponents && loopComponents.length > 0
      ? new Set(loopComponents.map((c) => c as LOOPComponentId))
      : undefined;
  const overlaySet = overlayComponents?.length
    ? new Set(
        overlayComponents.map((component) => component as LOOPComponentId)
      )
    : undefined;

  const options: HeaderOptions = {
    canvasWidth,
    headerHeight,
    word,
    difficultyLevel,
    showDifficultyBadge,
    loopComponents: loopSet,
    rotationPeriod,
    inversionPeriod,
    reflectionAxis,
    overlayComponents: overlaySet,
    compressedSegments,
    indicatorSizeScale,
    darkMode,
    letterStyles: sharedLetterStyles,
    glyphImages,
    glyphImagesAreThemeColored: !!glyphImages,
  };

  // Cast: node-canvas CanvasRenderingContext2D is structurally compatible
  // with the DOM type used by the shared package, but TypeScript sees them
  // as different nominal types.
  sharedRenderHeader(
    ctx as unknown as globalThis.CanvasRenderingContext2D,
    options
  );
}

/**
 * Render user info footer at the bottom of a canvas.
 * Delegates to @tka/render-composition for visual parity with the app.
 *
 * Same signature as before — callers don't need to change.
 */
export function renderUserInfo(
  ctx: CanvasRenderingContext2D,
  userInfo: UserExportInfo,
  canvasWidth: number,
  canvasHeight: number,
  footerHeight: number,
  darkMode: boolean = true
): void {
  ensureFontsRegistered();

  // Resolve the notes text: explicit notes > contextual caption > default
  const contextualCaption = userInfo.word
    ? getContextualCaption(userInfo.word)
    : null;
  const resolvedNotes = userInfo.notes?.trim()
    ? userInfo.notes
    : (contextualCaption ?? undefined);

  const options: FooterOptions = {
    canvasWidth,
    canvasHeight,
    footerHeight,
    notes: resolvedNotes,
    darkMode,
  };

  sharedRenderFooter(
    ctx as unknown as globalThis.CanvasRenderingContext2D,
    options
  );
}

/**
 * Calculate header height based on step size.
 * Delegates to @tka/render-composition.
 */
export function calculateHeaderHeight(stepSize: number): number {
  return sharedCalculateHeaderHeight(stepSize);
}

/**
 * Calculate footer height based on step size.
 * Delegates to @tka/render-composition.
 */
export function calculateFooterHeight(stepSize: number): number {
  return sharedCalculateFooterHeight(stepSize);
}

// Contextual captions (humor profile) — MCP-specific feature

/**
 * Get a contextual caption based on the word content.
 *
 * Humor Profile (derived from user preference quiz, Jan 2026):
 * - Primary: DEADPAN (flat, understated observations)
 * - Secondary: ABSURDIST (non-sequiturs, intentional ambiguity) + SARDONIC (bitter cultural obs)
 * - Tertiary: DICTIONARY (fake definitions with semicolons) + DOMAIN (flow arts in-jokes)
 * - Likes: Intentional ambiguity, double meanings, skepticism of claims
 * - Avoid: Self-deprecating humor, Twitter-specific references
 *
 * The funniest outcome is often no caption at all for words we don't recognize.
 */
function getContextualCaption(word: string): string | null {
  const upper = word.toUpperCase();

  // Curated captions from user preference quiz (Jan 2026)
  // Each was selected from 4 options representing different comedy lenses
  const curatedCaptions: Record<string, string> = {
    // === ROUND 1: Initial quiz ===
    BIGDICK: "Narrator: It wasn't",
    BUTTHOLE: "A hole lot of talent",
    LOSER: "At least you're honest",
    PENIS: "Anatomy 101",
    DADDY: "Call me that again",
    SATAN: "Hell yeah",
    MOIST: "Your discomfort is valid",
    KAREN: "I need to speak to the choreographer",
    THICC: "The C's are load-bearing",
    VEGAN: "We get it",
    CUMSHOT: "Photography term, obviously",
    POOP: "Timeless",
    BOOBS: "Calculator humor never dies",
    SEXY: "Debatable",
    NICE: "Nice",
    FART: "The body keeps the score",
    BALLS: "Plural for emphasis",
    SIMP: "The DMs are open",
    YEET: "Maximum velocity achieved",
    LOVE: "Tennis scoring is weird",
    WEED: "For gardening purposes",
    HELP: "Blink twice if you need it",
    CHAD: "Peak prop confidence",
    NERD: "Correct",
    MILF: "Man I Love Flow-arts",
    SLAY: "The props fear you",
    DEAD: "Inside or outside?",

    // === ROUND 2: Profanity/crude (user-approved) ===
    SHIT: "Poetry",
    FUCK: "Expressive",
    ASS: "Cheeky",
    DAMN: "Strong feelings",
    HELL: "Hot take",
    BUTT: "See: BUTTHOLE",
    SEX: "The checkbox kind",
    CRAP: "Quality content",
    DUMB: "The compliment or the insult?",
    STUPID: "Big brain energy",
    IDIOT: "The Greek root means 'private citizen'",
    HATE: "The sequel to LOVE",
    KILL: "Metaphorically",
    DIE: "The singular of dice",
    BOOB: "Just the one",
    PEE: "Going with the flow",
    SMALLDICK: "Narrator: It wasn't",
    ASSWIPE: "Mom would be proud",

    // === ROUND 3: Flow arts domain (user-approved) ===
    FLOW: "The whole point",
    SPIN: "Revolutionary",
    FIRE: "Safety third",
    POI: "The Maori would like a word",
    STAFF: "HR or prop?",
    HOOP: "Humans Orbiting Objects Persistently",
    FAN: "The prop or the admirer?",
    CLUB: "Carefully Leveraged Utility Baton",
    JUGGLE: "Controlled chaos",
    PROP: "Personality extension device",
    BURN: "The good kind",
    JAM: "Bring your own props",

    // === ROUND 4: Internet culture (user-approved) ===
    CRINGE: "(n.) The feeling of watching yourself on video",
    BASED: "(adj.) Possessing opinions the speaker agrees with",
    COPE: "(v.) To manage; see also: seethe",
    MID: "(adj.) Acceptable; technically",
    GOAT: "(n.) A horned mammal; also: bold claim",
    SIGMA: "(n.) Summation symbol; also: lone wolf cosplay",
    ALPHA: "(n.) A position where hands are opposite; wolves optional",
    BETA: "(n.) A position where hands are together; not an insult",
    BOOMER: "(n.) Someone born 1946-1964; also: anyone over 30",
    ZOOMER: "No cap fr fr",
    BRUH: "The universal response",
    LMAO: "Laughing, presumably",
    LMFAO: "Laughing harder, allegedly",
    WTF: "Valid question",
    OMG: "Dramatic",
    LOL: "Were you though?",
    ROFL: "Carpet burn incoming",
    YOLO: "Proof pending",
    SWAG: "(acr.) Spinning With Absolute Grace",
    EPIC: "Scale: unverified",
    FAIL: "Learning opportunity",
    COOL: "Temperature or approval?",
    DOPE: "Illegal in some states",
    SICK: "(adj.) Ill; also: impressive; confusing",
    TRASH: "Oscar the Grouch approved",
    BASIC: "(adj.) Fundamental; also: Starbucks-adjacent",
  };

  // Check for exact match first
  if (curatedCaptions[upper]) {
    return curatedCaptions[upper];
  }

  // Check for partial matches (word contains a known term)
  for (const [term, caption] of Object.entries(curatedCaptions)) {
    if (upper.includes(term) && term.length >= 4) {
      return caption;
    }
  }

  // No match - return null (often funnier than a forced caption)
  return null;
}
