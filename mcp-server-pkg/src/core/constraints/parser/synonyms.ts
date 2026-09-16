/**
 * Synonym Dictionary
 *
 * Maps natural language variations to canonical terms.
 * Supports fuzzy matching of user input to constraint parameters.
 */

/**
 * Canonical terms and their synonyms.
 */
export const SYNONYMS: Record<string, string[]> = {
  // Motion types
  pro: ["prospin", "isolation", "iso", "same", "same-direction"],
  anti: ["antispin", "opposite", "opp"],
  static: ["stationary", "still", "no-motion", "no motion"],
  dash: [
    "dashing",
    "across",
    "dashes",
    "dash-motion",
    "dash-motions",
    "type-4",
    "type-5",
    "dual-dash",
  ],

  // Rotation directions
  cw: ["clockwise", "clock", "right"],
  ccw: [
    "counterclockwise",
    "counter-clockwise",
    "counter",
    "left",
    "anticlockwise",
    "anti-clockwise",
  ],

  // Performer-relative hands. Blue/red remain accepted as legacy palette aliases.
  left: ["left", "left-hand", "left hand", "blue", "blue-hand", "blue hand"],
  right: ["right", "right-hand", "right hand", "red", "red-hand", "red hand"],
  both: ["all", "either", "any"],

  // Constraint modes
  maximize: [
    "max",
    "more",
    "most",
    "prefer",
    "high",
    "increase",
    "favour",
    "favor",
  ],
  minimize: [
    "min",
    "less",
    "least",
    "reduce",
    "low",
    "decrease",
    "fewer",
    "avoid",
  ],
  require: ["must", "only", "all", "force", "enforce", "always", "strict"],
  exclude: ["no", "none", "never", "ban", "block", "forbid", "without"],

  // Constraint concepts
  continuity: [
    "continuous",
    "flow",
    "smooth",
    "flowing",
    "seamless",
    "unbroken",
  ],
  reversal: [
    "reversals",
    "direction-change",
    "break",
    "breaks",
    "flip",
    "flips",
  ],
  handpath: [
    "hand-path",
    "hand path",
    "hand reversal",
    "handpath reversals",
    "path reversal",
    "path reversals",
    "hand direction",
  ],
  propreversal: [
    "prop reversal",
    "prop reversals",
    "spin reversal",
    "spin reversals",
    "rotation reversal",
  ],

  // Placements
  alpha: ["opposite", "split", "across"],
  beta: ["together", "same", "tog"],
  gamma: ["right-angle", "perpendicular", "l-shape"],

  // VTG timing
  split: ["apart", "offset", "out-of-phase"],
  together: ["tog", "sync", "synchronized", "in-phase", "same-time"],

  // Patterns
  alternating: ["alternate", "switching", "back-and-forth"],
};

/**
 * Reverse lookup: synonym -> canonical term.
 */
const REVERSE_LOOKUP = new Map<string, string>();

for (const [canonical, synonyms] of Object.entries(SYNONYMS)) {
  REVERSE_LOOKUP.set(canonical.toLowerCase(), canonical);
  for (const syn of synonyms) {
    REVERSE_LOOKUP.set(syn.toLowerCase(), canonical);
  }
}

/**
 * Normalize a term to its canonical form.
 * Returns the term unchanged if no match found.
 */
export function canonicalize(term: string): string {
  const normalized = term.toLowerCase().trim().replace(/-/g, "");
  return REVERSE_LOOKUP.get(normalized) ?? term;
}

export function matchesConcept(term: string, concept: string): boolean {
  const canonicalTerm = canonicalize(term);
  const canonicalConcept = canonicalize(concept);
  return canonicalTerm === canonicalConcept;
}

/**
 * Uses word boundary matching to avoid partial matches (e.g., "low" in "flow").
 */
export function findMatchingTerms(text: string, concept: string): string[] {
  const canonical = canonicalize(concept);
  const synonyms = SYNONYMS[canonical] ?? [];
  const allTerms = [canonical, ...synonyms];

  const matches: string[] = [];
  const lowerText = text.toLowerCase();

  for (const term of allTerms) {
    const lowerTerm = term.toLowerCase();
    // Use word boundary regex to match whole words only
    // This prevents "low" from matching inside "flow"
    const pattern = new RegExp(`\\b${escapeRegex(lowerTerm)}\\b`, "i");
    if (pattern.test(lowerText)) {
      matches.push(term);
    }
  }

  return matches;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsConcept(text: string, concept: string): boolean {
  return findMatchingTerms(text, concept).length > 0;
}
