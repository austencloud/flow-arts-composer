/**
 * Per-topic SEO copy for the crawlable paginated guide routes
 * (`/guide/level-1/<slug>`), keyed by manifest id. Every string is Austen's -
 * `h1`/`tagline` are his section title + first explanatory sentence, `title`
 * and `description` the same lifted verbatim and truncated to the meta caps.
 * NEVER AI-composed (no-ghostwriting-austen). Exception: the `title` suffix
 * "· Flow Arts Notation Guide" and the Hand Motions / Staff Motions title
 * wording were proposed for search and approved by Austen on 2026-09-23.
 * Breadcrumbs are derived from the manifest title, so they are not stored here.
 *
 * Harvested from the prior doorway `+page.svelte` files (which carried the same
 * verbatim GuideSeo props) before those files were removed.
 */
export type GuidePageSeo = {
  /** On-page <h1> - the topic's display title. */
  h1: string;
  /** Optional sub-hero line (Austen's first explanatory sentence). */
  tagline?: string;
  /** <title> / og:title. */
  title: string;
  /** meta description / og:description - verbatim, ≤155 chars. */
  description: string;
};

export const GUIDE_PAGE_SEO: Record<string, GuidePageSeo> = {
  "hand-placements": {
    h1: "Flow Arts Placements: Alpha, Beta, Gamma",
    tagline: "The three starting hand placements in The Kinetic Alphabet.",
    title: "Flow Arts Placements: Alpha, Beta, Gamma · The Kinetic Alphabet",
    description:
      "The three starting hand placements in The Kinetic Alphabet notation. In Alpha the hands occupy the points across from each other; in Beta the same point; in Gamma they form a right angle.",
  },
  "the-grid": {
    h1: "The Grid",
    tagline: "The Kinetic Alphabet is based on a 4-point grid.",
    title: "The Grid · Flow Arts Notation Guide",
    description: "The Kinetic Alphabet is based on a 4-point grid.",
  },
  "hand-motions": {
    h1: "Hand Motions",
    tagline: "There are three fundamental hand motions in the Alphabet.",
    title: "Hand Motions: Shift, Dash, Static · Flow Arts Notation Guide",
    description: "There are three fundamental hand motions in the Alphabet.",
  },
  "hm-type1": {
    h1: "Type 1 Dual-Shifts: Alpha and Beta",
    tagline: "When both hands move to adjacent locations, it’s called a Dual-Shift.",
    title: "Type 1 Dual-Shifts: Alpha and Beta · Flow Arts Notation Guide",
    description: "When both hands move to adjacent locations, it’s called a Dual-Shift.",
  },
  "hm-gamma": {
    h1: "Gamma: Quarter-Opposite and Quarter-Same",
    tagline:
      "Gamma, aka quarter-time, is based on two often forgotten modes: Quarter-Opp and Quarter-Same.",
    title: "Gamma: Quarter-Opposite and Quarter-Same · Flow Arts Notation Guide",
    description:
      "Gamma, aka quarter-time, is based on two often forgotten modes: Quarter-Opp and Quarter-Same.",
  },
  "hm-type2": {
    h1: "Type 2 Shifts",
    tagline: "To move between γ and α/β, you can shift one hand and keep the other hand static.",
    title: "Type 2 Shifts · Flow Arts Notation Guide",
    description: "To move between γ and α/β, you can shift one hand and keep the other hand static.",
  },
  "hm-type34": {
    h1: "Type 3 Cross-Shifts",
    tagline: "A Cross-Shift combines a shift and a dash.",
    title: "Type 3 Cross-Shifts · Flow Arts Notation Guide",
    description: "A Cross-Shift combines a shift and a dash.",
  },
  "hm-type56": {
    h1: "Type 4, 5, 6: Dash, Dual-Dash, Static",
    tagline: "With a Dash, one hand executes a dash while the other hand remains static.",
    title: "Type 4, 5, 6: Dash, Dual-Dash, Static · Flow Arts Notation Guide",
    description: "With a Dash, one hand executes a dash while the other hand remains static.",
  },
  "staff-placements": {
    h1: "Staff Placements",
    tagline: "When writing sequences with staves, it helps to mark the thumb end with a line.",
    title: "Staff Placements · Flow Arts Notation Guide",
    description: "When writing sequences with staves, it helps to mark the thumb end with a line.",
  },
  "staff-motions": {
    h1: "Staff Motions",
    tagline: "During a shift, a prop can rotate in one of two directions - Prospin or Antispin",
    title: "Staff Motions: Prospin and Antispin · Flow Arts Notation Guide",
    description: "During a shift, a prop can rotate in one of two directions - Prospin or Antispin",
  },
  "negative-space": {
    h1: "Negative Space and Body Turns",
    tagline:
      "Many sequences seem impossible, but most can be solved by using negative space or body turns.",
    title: "Negative Space and Body Turns · Flow Arts Notation Guide",
    description:
      "Many sequences seem impossible, but most can be solved by using negative space or body turns.",
  },
  "base-letters": {
    h1: "Base Letters",
    tagline: "Just like positions, each motion pictograph can be rotated, reflected, or color swapped.",
    title: "Base Letters · Flow Arts Notation Guide",
    description:
      "Just like positions, each motion pictograph can be rotated, reflected, or color swapped.",
  },
  "lt1-abc-ghi": {
    h1: "Alpha and Beta Words",
    tagline: "The first words we will learn correspond to VTG’s 1:1 motions.",
    title: "Alpha and Beta Words · Flow Arts Notation Guide",
    description: "The first words we will learn correspond to VTG’s 1:1 motions.",
  },
  "lt1-dj-ek-fl": {
    h1: "Compound Letters",
    tagline: "Now let’s look at the letters that move from β→α or α→β.",
    title: "Compound Letters · Flow Arts Notation Guide",
    description: "Now let’s look at the letters that move from β→α or α→β.",
  },
  "lt1-mp-nq-or-stuv": {
    h1: "Gamma Letters",
    tagline: "γ→γ motions can combine with any other γ→γ motion to create lots of words!",
    title: "Gamma Letters · Flow Arts Notation Guide",
    description: "γ→γ motions can combine with any other γ→γ motion to create lots of words!",
  },
  "lt1-gamma-words": {
    h1: "Gamma Words",
    tagline: "These are the simplest 4-letter words created with continuous γ→γ motions.",
    title: "Gamma Words · Flow Arts Notation Guide",
    description: "These are the simplest 4-letter words created with continuous γ→γ motions:",
  },
  "lt2-wxyz": {
    h1: "Type 2 Shift Letters",
    tagline: "So far we’ve learned how to move between α↔β and between γ↔γ.",
    title: "Type 2 Shift Letters · Flow Arts Notation Guide",
    description: "So far we’ve learned how to move between α↔β and between γ↔γ.",
  },
  "lt3-dash-letters": {
    h1: "Type 3 Cross-Shift Letters",
    tagline:
      "Cross-Shifts use the same letters as Shifts, but each letter is followed by a dash to indicate that the other hand is dashing into its end position.",
    title: "Type 3 Cross-Shift Letters · Flow Arts Notation Guide",
    description:
      "Cross-Shifts use the same letters as Shifts, but each letter is followed by a dash to indicate that the other hand is dashing into its end position.",
  },
  "lt456-phi-psi-lambda": {
    h1: "Type 4, 5, 6 Letters: Phi, Psi, Lambda",
    tagline: "With a Dash, one prop executes a dash and the other remains static.",
    title: "Type 4, 5, 6 Letters: Phi, Psi, Lambda · Flow Arts Notation Guide",
    description: "With a Dash, one prop executes a dash and the other remains static.",
  },
  words: {
    h1: "Words",
    tagline: "Let’s create more complex words using pictographs!",
    title: "Words · Flow Arts Notation Guide",
    description: "Let’s create more complex words using pictographs!",
  },
  permutations: {
    h1: "LOOPs",
    tagline: "Three common types of LOOPs are Mirrored, Rotated, and Swapped.",
    title: "LOOPs · Flow Arts Notation Guide",
    description: "Three common types of LOOPs are Mirrored, Rotated, and Swapped.",
  },
  reversals: {
    h1: "Reversals",
    tagline: "Reversals open up a huge number of possibilities!",
    title: "Reversals · Flow Arts Notation Guide",
    description: "Reversals open up a huge number of possibilities!",
  },
  "examples-abc": {
    h1: "Examples",
    tagline: "Let’s practice reversals and permutations.",
    title: "Examples · Flow Arts Notation Guide",
    description: "Let’s practice reversals and permutations.",
  },
  "examples-cccc": {
    h1: "Hybrid Reversals: CCCC",
    tagline: "Let’s add reversals after the second B.",
    title: "Hybrid Reversals: CCCC · Flow Arts Notation Guide",
    description: "Let’s add reversals after the second B.",
  },
  "examples-acac": {
    h1: "Mixed Words: ACAC and BCBC",
    tagline: "When combining a hybrid like C with a non-hybrid like A or B, a prop-reversal is necessary.",
    title: "Mixed Words: ACAC and BCBC · Flow Arts Notation Guide",
    description:
      "When combining a hybrid like C with a non-hybrid like A or B, a prop-reversal is necessary.",
  },
  "misc-permutations": {
    h1: "Type 1 LOOPs",
    tagline:
      "In this example of DJII, the graphs in the second repetition (steps 5-8) mirror the graphs in the first repetition (steps 1-4), classifying it as a Mirrored LOOP.",
    title: "Type 1 LOOPs · Flow Arts Notation Guide",
    description: "Type 1 LOOPs in The Kinetic Alphabet flow arts notation.",
  },
  "gamma-loops": {
    h1: "Gamma LOOPs",
    tagline: "The γ→γ letters can connect to any other γ→γ letter.",
    title: "Gamma LOOPs · Flow Arts Notation Guide",
    description: "The γ→γ letters can connect to any other γ→γ letter.",
  },
  "type2-loops": {
    h1: "Type 2 LOOPs",
    tagline: "These words use the Type 2 letters to travel between α/β and γ.",
    title: "Type 2 LOOPs · Flow Arts Notation Guide",
    description: "These words use the Type 2 letters to travel between α/β and γ.",
  },
  "sixteen-count": {
    h1: "16-Count Sequences",
    tagline: "These 4-letter words repeat 4 times, giving us 16-count sequences.",
    title: "16-Count Sequences · Flow Arts Notation Guide",
    description: "These 4-letter words repeat 4 times, giving us 16-count sequences.",
  },
  "eight-letter-words": {
    h1: "8-Letter Words",
    tagline: "Words can be any length.",
    title: "8-Letter Words · Flow Arts Notation Guide",
    description: "Words can be any length.",
  },
  "prop-reversal-loops": {
    h1: "Prop-Reversal LOOPs",
    tagline: "Each of these words uses a prop-reversal.",
    title: "Prop-Reversal LOOPs · Flow Arts Notation Guide",
    description: "Each of these words uses a prop-reversal.",
  },
  "full-reversal-loops": {
    h1: "Full-Reversal LOOPs",
    tagline: "Each of these words uses a full-reversal.",
    title: "Full-Reversal LOOPs · Flow Arts Notation Guide",
    description: "Each of these words uses a full-reversal.",
  },
  codex: {
    h1: "The Codex",
    title: "The Codex · Flow Arts Notation Guide",
    description: "The Codex in The Kinetic Alphabet flow arts notation.",
  },
  "codex-2": {
    h1: "The Codex, Continued",
    title: "The Codex, Continued · Flow Arts Notation Guide",
    description: "The Codex, Continued in The Kinetic Alphabet flow arts notation.",
  },
};

/** SEO copy for a slug, falling back to a manifest title when unharvested. */
export function seoForSlug(slug: string, fallbackTitle: string): GuidePageSeo {
  return (
    GUIDE_PAGE_SEO[slug] ?? {
      h1: fallbackTitle,
      title: `${fallbackTitle} · Flow Arts Notation Guide`,
      description: `${fallbackTitle} in The Kinetic Alphabet, a flow arts choreography notation system.`,
    }
  );
}
