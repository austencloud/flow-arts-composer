import {
  BASE_ALPHABET_LETTERS,
  GLOSSARY,
  LETTER_TYPES,
  TERM_ALIASES,
  resolveTermAlias,
} from "@tka/domain";
import type { GlossaryCategory } from "@tka/domain";
import type { PageServerLoad } from "./$types";
import { LETTER_DESCRIPTIONS } from "./_data/letter-descriptions.server";
import { buildCanonicalLetterExplorerHref } from "./_components/codex-boards/letter-explorer-url";

// Static reference: render the current glossary at build time. The @tka/domain
// package stays server-side (this load runs at prerender); the page receives a
// serialized view-model of the glossary entries it displays.
export const prerender = true;

const INDIVIDUAL_LETTER_ENTRY_PATTERN =
  /^letter-(?:[a-z](?:-dash)?|(?:alpha|beta|gamma|delta|lambda|omega|phi|psi|sigma|theta)(?:-dash)?)$/;

const LETTER_TYPE_NUMBERS = ["1", "2", "3", "4", "5", "6"] as const;
const LETTER_TYPE_KEYS = LETTER_TYPE_NUMBERS.map((number) => `type-${number}`);

// Display order + human labels for every public glossary category. The visual
// Letter Codex is returned separately below because pictographs are not
// DefinedTerms and must not inflate the glossary's term count or JSON-LD.
const CATEGORY_ORDER: { key: GlossaryCategory; label: string }[] = [
  { key: "general", label: "Core Concepts" },
  { key: "placement", label: "Placements" },
  { key: "letterType", label: "Letter Types" },
  { key: "motion", label: "Motions" },
  { key: "rotation", label: "Rotations" },
  { key: "grid", label: "Grid" },
  { key: "notation", label: "Notation" },
  { key: "sequence", label: "Words & Sequences" },
  { key: "execution", label: "Execution & Technique" },
];

const ATLAS_REGION_DEFINITIONS = [
  {
    key: "space",
    label: "Space",
    summary: "Grids, points, and placements",
    description:
      "Explore grids, points, and named placements in one spatial reference.",
    groupKeys: ["placement", "grid"],
    includesCodex: false,
  },
  {
    key: "motion",
    label: "Motion",
    summary: "Hand paths and prop rotations",
    description:
      "Compare hand paths and prop rotations, then follow them into the letter families they produce.",
    groupKeys: ["motion", "rotation"],
    includesCodex: false,
  },
  {
    key: "letters",
    label: "Letters",
    summary: "Types, variants, and use",
    description:
      "See the 47 canonical letters by motion type, then inspect their pictographs, variants, and learning contexts.",
    groupKeys: ["letterType"],
    includesCodex: true,
  },
  {
    key: "notation",
    label: "Notation",
    summary: "Glyphs, timing, and direction",
    description:
      "Inspect glyphs, timing, direction, and the notation models that connect them.",
    groupKeys: ["notation"],
    includesCodex: false,
  },
  {
    key: "patterns",
    label: "Patterns",
    summary: "Words, LOOPs, and transformations",
    description:
      "Explore words, sequences, LOOPs, constraints, and transformations without losing the underlying steps.",
    groupKeys: ["sequence"],
    includesCodex: false,
  },
  {
    key: "foundation",
    label: "Foundation",
    summary: "Core concepts, props, and execution",
    description:
      "Trace the core concepts, prop references, and execution terms that support the rest of the system.",
    groupKeys: ["general", "execution"],
    includesCodex: false,
  },
] as const;

// GLOSSARY keys are lowercase kebab slugs — that's the data/MCP lookup layer.
// Humans read Title Case with spaces, so the page displays humanized names.
// Overrides cover acronyms and special casing; hyphens that carry meaning
// (the "-" letter-suffix convention) keep their hyphen.
const DISPLAY_OVERRIDES: Record<string, string> = {
  vtg: "VTG",
  caps: "CAPs",
  pads: "PADS",
  "rubiks-cube": "Rubik's Cube",
  "quarter-opposite": "Quarter-Opposite",
  "quarter-same": "Quarter-Same",
  // The "-" suffix is the letter-naming convention, not a word separator.
  "tau-dash": "Tau-Dash",
};

function displayName(key: string): string {
  const letterTypeNumber = key.match(/^type-([1-6])$/)?.[1];
  if (letterTypeNumber) {
    const letterType = LETTER_TYPES[letterTypeNumber];
    if (!letterType) {
      throw new Error(`[glossary] Missing canonical Type ${letterTypeNumber}`);
    }
    return `Type ${letterTypeNumber}: ${letterType.name}`;
  }
  const override = DISPLAY_OVERRIDES[key];
  if (override) return override;
  return key
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugify(key: string, i: number): string {
  const s = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Greek-only keys (α, ψ …) slugify to empty — fall back to a stable index slug.
  return s || `term-${i}`;
}

export const load: PageServerLoad = () => {
  // Individual dataframe letters are drawn by the Codex, not defined in prose,
  // so their entries stay out of the term list. Tau-Dash is NOT one of them:
  // it is outside the Level 1 dataframe, so the Codex cannot draw it and it
  // stays where it belongs — a written term among the core concepts.
  const entries = Object.entries(GLOSSARY).filter(
    ([key]) => !INDIVIDUAL_LETTER_ENTRY_PATTERN.test(key)
  );
  const entriesByKey = new Map(entries);

  // Slugs derive from the raw KEY (not the display name) so existing #anchors
  // and JSON-LD @ids stay stable across display-name changes.
  const sortedKeys = entries.map(([key]) => key).sort();
  const slugOf = new Map<string, string>();
  sortedKeys.forEach((k, i) => slugOf.set(k, slugify(k, i)));

  const aliasesByTerm = new Map<string, string[]>();
  for (const [alias, target] of Object.entries(TERM_ALIASES)) {
    if (!slugOf.has(target)) continue;
    const aliases = aliasesByTerm.get(target) ?? [];
    aliases.push(alias);
    aliasesByTerm.set(target, aliases);
  }

  function resolveRelatedTerm(term: string): string | null {
    if (slugOf.has(term)) return term;
    const resolved = resolveTermAlias(term);
    return slugOf.has(resolved) ? resolved : null;
  }

  const groups = CATEGORY_ORDER.map(({ key, label }) => {
    const categoryEntries =
      key === "letterType"
        ? LETTER_TYPE_KEYS.map((letterTypeKey) => {
            const entry = entriesByKey.get(letterTypeKey);
            if (!entry) {
              throw new Error(
                `[glossary] Missing canonical ${letterTypeKey} definition`
              );
            }
            return [letterTypeKey, entry] as const;
          })
        : entries.filter(([, entry]) => entry.category === key);

    const terms = categoryEntries
      .map(([k, e]) => ({
        term: displayName(k),
        slug: slugOf.get(k)!,
        aliases: aliasesByTerm.get(k) ?? [],
        definition: e.definition,
        examples: e.examples,
        // Direct glossary keys win; aliases are only a fallback. This keeps a
        // canonical entry from being redirected by an over-broad alias.
        related: e.relatedTerms
          .map(resolveRelatedTerm)
          .filter((r): r is string => r !== null)
          .map((r) => ({ term: displayName(r), slug: slugOf.get(r)! })),
        benefit: e.benefit ?? null,
        importance: e.importance ?? null,
        letters: k.startsWith("type-")
          ? (LETTER_TYPES[k.slice("type-".length)]?.letters ?? []).map(
              (letter) => ({
                label: letter,
                href: buildCanonicalLetterExplorerHref(letter),
              })
            )
          : [],
      }))
      .sort((a, b) =>
        a.term.localeCompare(b.term, undefined, { numeric: true })
      );
    return { key, label, sectionSlug: `cat-${key.toLowerCase()}`, terms };
  }).filter((g) => g.terms.length > 0);

  const placed = groups.reduce((n, g) => n + g.terms.length, 0);
  // Loud during build if an entry's category has no row above.
  if (placed !== entries.length) {
    console.warn(
      `[glossary] ${entries.length - placed} term(s) dropped — category missing from CATEGORY_ORDER`
    );
  }

  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const atlasRegions = ATLAS_REGION_DEFINITIONS.map((region) => {
    const categories = region.groupKeys.map((key) => {
      const group = groupByKey.get(key);
      if (!group) {
        throw new Error(`[glossary] Missing Atlas category ${key}`);
      }
      return {
        key: group.key,
        label: group.label,
        sectionSlug: group.sectionSlug,
        countLabel: `${group.terms.length} terms`,
      };
    });
    const termCount = region.groupKeys.reduce(
      (count, key) => count + (groupByKey.get(key)?.terms.length ?? 0),
      0
    );

    return {
      ...region,
      groupKeys: [...region.groupKeys],
      sectionSlug: region.includesCodex ? "cat-letter" : `atlas-${region.key}`,
      countLabel: region.includesCodex
        ? `${BASE_ALPHABET_LETTERS.length} letters · ${LETTER_TYPE_KEYS.length} families`
        : `${termCount} entries`,
      categories: region.includesCodex
        ? [
            {
              key: "letter",
              label: "Letter Atlas",
              sectionSlug: "cat-letter",
              countLabel: `${BASE_ALPHABET_LETTERS.length} letters`,
            },
            ...categories,
          ]
        : categories,
    };
  });

  const letterTypes = LETTER_TYPE_NUMBERS.map((number) => {
    const letterType = LETTER_TYPES[number];
    if (!letterType) {
      throw new Error(`[glossary] Missing canonical Type ${number}`);
    }
    return {
      number,
      label: `Type ${number}: ${letterType.name}`,
      countLabel: `${letterType.letters.length} letters`,
    };
  });

  return {
    groups,
    total: placed,
    atlasRegions,
    letterTypes,
    codex: {
      key: "letter",
      label: "Letter Codex",
      sectionSlug: "cat-letter",
      // The two canonical guide sheets, and nothing else: the Codex is a
      // pictorial index of the Level 1 dataframe.
      letters: [...BASE_ALPHABET_LETTERS],
      // One description per letter, composed from canonical domain facts at
      // prerender time so the detail overlay can say what a letter IS without
      // pulling @tka/domain into the browser. See _data/letter-descriptions.
      descriptions: LETTER_DESCRIPTIONS,
    },
  };
};
