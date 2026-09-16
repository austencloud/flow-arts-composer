/**
 * gallery-drill-catalog
 *
 * The category catalog shared by the gallery's two products: the editorial
 * LANDING (GalleryLanding) and the filter WORKSPACE (GalleryWorkspace, plus the
 * persistent desktop rail). Both render the same category catalog from the
 * same live counts — the shape that makes landing/workspace drift impossible.
 *
 * Split out of GalleryDrill.svelte (2026-08-04) as part of the split-pane
 * workspace project. Pure derivation: no DOM, no markup.
 */

import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { ACTIVE_DIFFICULTY_LEVELS } from "$lib/shared/config/difficulty-styles";
import { TND_ELEMENTS } from "$lib/features/choreo-card/domain/tnd-element";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { LOOP_COMPONENT_MAP } from "$lib/shared/browse/domain/constants/loop-constants";
import { resolveStepCount } from "$lib/shared/browse/services/browse-sorter";
import {
  applyFilter,
  getSequenceMaxTurn,
} from "$lib/shared/browse/services/browse-filter";
import { startPlacementManager } from "$lib/shared/create/services/start-placement-manager";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { browser } from "$app/environment";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  deriveCreators,
  deriveAvailableStartingLetterOptions,
  pickCollage,
  pickCreatorAvatars,
  pickCreatorSamples,
  pickLengthPair,
  pickLevelRepresentatives,
} from "./pick-representatives";

/** Every sub-screen the drill can show. "chooser" is the landing / flat canvas. */
export type Section =
  | "chooser"
  | "level"
  | "length"
  | "letter"
  | "placement"
  | "gridmode"
  | "author"
  | "performance"
  | "loop"
  | "family"
  | "max_turn_intensity"
  | "collection";

export const SECTIONS: readonly Section[] = [
  "chooser",
  "level",
  "length",
  "letter",
  "placement",
  "gridmode",
  "author",
  "performance",
  "loop",
  "family",
  "max_turn_intensity",
  "collection",
];

/** Class applied to the active screen — the focus target after navigation. */
export const SCREEN_CLASS: Record<Section, string> = {
  chooser: "screen-chooser",
  level: "screen-level",
  length: "screen-length",
  letter: "screen-letter",
  placement: "screen-placements",
  gridmode: "screen-gridmode",
  author: "screen-creator",
  performance: "screen-performance",
  loop: "screen-loop",
  family: "screen-family",
  max_turn_intensity: "screen-max-turns",
  collection: "screen-collections",
};

export const LEVELS = ACTIVE_DIFFICULTY_LEVELS;

// Legacy desktop app's level descriptions, verbatim (filter_by_level_section).
export const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Base letters with no turns.",
  2: "Turns added with only radial orientations.",
  3: "Non-radial orientations.",
};

// Legacy starting_position_section values + descriptions, verbatim.
export const PLACEMENTS = [
  {
    value: "alpha",
    label: "Alpha",
    desc: "Hands apart.",
    img: "/images/position_images/alpha.png",
  },
  {
    value: "beta",
    label: "Beta",
    desc: "Hands together.",
    img: "/images/position_images/beta.png",
  },
  {
    value: "gamma",
    label: "Gamma",
    desc: "Hands form a right angle.",
    img: "/images/position_images/gamma.png",
  },
];

// Grid-mode values + descriptions. The picker renders the app's live,
// theme-aware grid primitive rather than the legacy white-plate assets.
export const GRID_MODES = [
  { value: "diamond", label: "Diamond", desc: "Cardinal points: N, E, S, W" },
  { value: "box", label: "Box", desc: "Diagonal points: NE, SE, SW, NW" },
];

// Loop structure — the same component catalog the LOOP filter chip exposes
// (labels/icons/colors from the canonical LOOP_COMPONENT_MAP; rotated splits
// into halved/quartered exactly like the chip).
export const LOOP_OPTIONS = (() => {
  const rotated = LOOP_COMPONENT_MAP.get(LOOPComponent.ROTATED)!;
  return [
    {
      value: "component:rotated_halved",
      label: "Rotated (halved)",
      desc: "Repeats in two rotated halves.",
      icon: "fa-rotate",
      color: rotated.color,
    },
    {
      value: "component:rotated_quartered",
      label: "Rotated (quartered)",
      desc: "Repeats in four rotated quarters.",
      icon: "fa-arrows-spin",
      color: rotated.color,
    },
    ...[
      LOOPComponent.MIRRORED,
      LOOPComponent.FLIPPED,
      LOOPComponent.SWAPPED,
      LOOPComponent.INVERTED,
      LOOPComponent.REWOUND,
    ].map((comp) => {
      const info = LOOP_COMPONENT_MAP.get(comp)!;
      return {
        value: `component:${comp}`,
        label: info.label,
        // The shared map's descriptions are unpunctuated fragments; the two
        // local rotated entries end in periods, so align the six.
        desc: info.description.endsWith(".")
          ? info.description
          : `${info.description}.`,
        icon: `fa-${info.icon}`,
        color: info.color,
      };
    }),
  ];
})();

const LETTER_TO_PLACEMENT: Record<string, string> = {
  [Letter.ALPHA]: "alpha",
  [Letter.BETA]: "beta",
  [Letter.GAMMA]: "gamma",
};

// Fixed per-slot tilts (deterministic; random tilt reads as instability).
export const FAN_TILTS = [-8, -2, 6];

// Peek art scales with the layout tier (the CSS container queries widen the
// tiles past 900px / 1600px, but SequencePeek's box is a prop — phone-sized
// art inside desktop tiles reads as an afterthought). Same thresholds as the
// @container rules so art and layout switch together.
export const PEEK_TIERS = {
  base: {
    fanW: 76,
    fanH: 92,
    shortW: 56,
    shortH: 84,
    longW: 118,
    longH: 84,
    collW: 44,
    collH: 34,
    levelW: 62,
    levelH: 56,
    creatorW: 44,
    creatorH: 54,
    letterH: 26,
    badge: "18px",
  },
  mid: {
    fanW: 76,
    fanH: 92,
    shortW: 56,
    shortH: 84,
    longW: 118,
    longH: 84,
    collW: 52,
    collH: 40,
    levelW: 62,
    levelH: 56,
    creatorW: 44,
    creatorH: 54,
    letterH: 30,
    badge: "18px",
  },
  wide: {
    fanW: 112,
    fanH: 136,
    shortW: 82,
    shortH: 122,
    longW: 172,
    longH: 122,
    collW: 60,
    collH: 46,
    levelW: 150,
    levelH: 140,
    creatorW: 58,
    creatorH: 72,
    letterH: 36,
    badge: "24px",
  },
  ultra: {
    fanW: 132,
    fanH: 160,
    shortW: 96,
    shortH: 144,
    longW: 204,
    longH: 144,
    collW: 84,
    collH: 64,
    levelW: 200,
    levelH: 186,
    creatorW: 72,
    creatorH: 90,
    letterH: 44,
    badge: "28px",
  },
  cinema: {
    fanW: 198,
    fanH: 240,
    shortW: 144,
    shortH: 216,
    longW: 306,
    longH: 216,
    collW: 126,
    collH: 96,
    levelW: 300,
    levelH: 279,
    creatorW: 108,
    creatorH: 135,
    letterH: 60,
    badge: "42px",
  },
} as const;

export type PeekTier = (typeof PEEK_TIERS)[keyof typeof PEEK_TIERS];

/** One collection the gallery can filter by. Hosts supply the live list; the
 * drill stays free of Firestore. */
export interface CollectionOption {
  readonly id: string;
  readonly name: string;
  /** Total sequences the collection holds, independent of the current rule. */
  readonly size: number;
  readonly coverImageUrl?: string;
  readonly color?: string;
  readonly icon?: string;
  /** "Curated by <name>" — whose collection this is. */
  readonly ownerName?: string;
  /** Owner collections expose their share action from the filter workspace too. */
  readonly canShare?: boolean;
  readonly ownerId?: string;
}

/** Art shown on a category tile. Every kind previews REAL catalog data. */
export type CategoryArt =
  | { kind: "icon"; icon: string }
  | { kind: "glyph"; word: string }
  | { kind: "plate"; src: string }
  | { kind: "grid" }
  | { kind: "dots"; colors: readonly string[] }
  | { kind: "avatars"; names: readonly string[] };

/** One tile in the category catalog — landing mini-grid, rail, unified canvas. */
export interface CategoryEntry {
  /** Stable key. Doubles as the view-transition-name suffix. */
  key: string;
  title: string;
  sub: string;
  art: CategoryArt;
  /** Opens this value editor. Absent for direct-apply tiles (Recent, Favorites). */
  section?: Exclude<Section, "chooser">;
  /** Direct-apply categories carry their filter instead of a section. */
  apply?: { type: BrowseFilterType; value: string; label: string };
  /** Navigation-only tile (Collections, pre-filter conversion). */
  navigate?: "collections";
  /** Narrowed out by the current rule: still mounted, dimmed, inert. */
  narrowedOut: boolean;
}

/** Reactive inputs the catalog derives from. Getters keep them live. */
export interface GalleryCatalogDeps {
  readonly pool: readonly SequenceData[];
  getCount: (type: BrowseFilterType, value: string | number) => number;
  readonly onToggleLoop: unknown;
  readonly activeLoopValues: ReadonlySet<string> | undefined;
  readonly onToggleFamily: unknown;
  readonly activeFamilyValues: ReadonlySet<string> | undefined;
  readonly onToggleValue: unknown;
  readonly isValueApplied:
    | ((type: BrowseFilterType, value: string | number) => boolean)
    | undefined;
  readonly unifiedFilterChooser: boolean;
  readonly showCollections: boolean;
  /** When present, the Collections tile opens a value editor instead of
   * navigating to the Library tab. */
  readonly collections: readonly CollectionOption[] | undefined;
  readonly drillWidth: number;
  readonly fluidWideCanvas: boolean;
}

export function createGalleryCatalog(deps: GalleryCatalogDeps) {
  const levelValues = $derived(
    LEVELS.map((lvl) => ({
      value: lvl,
      label: `Level ${lvl}`,
      count: deps.getCount(BrowseFilterType.DIFFICULTY, lvl),
    }))
  );
  const maxLevelCount = $derived(
    Math.max(1, ...levelValues.map((v) => v.count))
  );

  const lengthValues = $derived.by(() => {
    const lengths = new Set<number>();
    for (const seq of deps.pool) {
      const n = resolveStepCount(seq);
      if (n > 0) lengths.add(n);
    }
    return [...lengths]
      .sort((a, b) => a - b)
      .map((n) => ({
        value: n,
        label: `${n} steps`,
        count: deps.getCount(BrowseFilterType.LENGTH, n),
      }));
  });
  const maxLengthCount = $derived(
    Math.max(1, ...lengthValues.map((v) => v.count))
  );

  const maxTurnIntensityValues = $derived.by(() => {
    const ceilings = new Set<number>();
    for (const seq of deps.pool) {
      const m = getSequenceMaxTurn(seq);
      if (m > 0) ceilings.add(m);
    }
    return [...ceilings]
      .sort((a, b) => a - b)
      .map((n) => ({
        value: n,
        label: `≤${n} turns`,
        count: deps.getCount(BrowseFilterType.MAX_TURN_INTENSITY, n),
      }))
      .filter((v) => v.count > 0);
  });
  const maxTurnIntensityCount = $derived(
    Math.max(1, ...maxTurnIntensityValues.map((v) => v.count))
  );

  const letterValues = $derived(
    deriveAvailableStartingLetterOptions(
      deps.pool,
      (letter) => deps.getCount(BrowseFilterType.STARTING_LETTER, letter),
      (letter) =>
        deps.isValueApplied?.(BrowseFilterType.STARTING_LETTER, letter) ?? false
    )
  );

  const placementValues = $derived(
    PLACEMENTS.map((p) => ({
      ...p,
      count: deps.getCount(BrowseFilterType.STARTING_PLACEMENT, p.value),
    }))
  );
  const maxPlacementCount = $derived(
    Math.max(1, ...placementValues.map((v) => v.count))
  );

  // Real start-placement pictographs (alpha/beta/gamma) keyed by placement value —
  // the same canonical PictographData the Create start-placement picker renders.
  const startPlacementPictographs = $derived.by(() => {
    const map = new Map<string, PictographData>();
    if (!browser) return map;
    for (const pd of startPlacementManager.getDefaultStartPlacements(
      GridMode.DIAMOND
    )) {
      const key = LETTER_TO_PLACEMENT[pd.letter as string];
      if (key) map.set(key, pd);
    }
    return map;
  });

  const gridModeValues = $derived(
    GRID_MODES.map((g) => ({
      ...g,
      count: deps.getCount(BrowseFilterType.GRID_MODE, g.value),
    }))
  );
  const maxGridModeCount = $derived(
    Math.max(1, ...gridModeValues.map((v) => v.count))
  );

  // Keep APPLIED values in the list even at count 0 — counts compose with the
  // other active filters, so a later pick can zero out an applied structure;
  // its row must stay visible (and toggleable).
  const loopValues = $derived(
    LOOP_OPTIONS.map((o) => ({
      ...o,
      count: deps.getCount(BrowseFilterType.LOOP_TYPE, o.value),
    })).filter(
      (v) =>
        Boolean(deps.onToggleLoop) ||
        v.count > 0 ||
        (deps.activeLoopValues?.has(v.value) ?? false)
    )
  );
  const maxLoopCount = $derived(Math.max(1, ...loopValues.map((v) => v.count)));

  const familyValues = $derived(
    TND_ELEMENTS.map((el) => ({
      value: el.familyId,
      label: el.name,
      color: el.accentColor,
      icon: el.iconPath,
      count: deps.getCount(BrowseFilterType.TND_FAMILY, el.familyId),
    })).filter(
      (v) =>
        Boolean(deps.onToggleFamily) ||
        v.count > 0 ||
        (deps.activeFamilyValues?.has(v.value) ?? false)
    )
  );
  const maxFamilyCount = $derived(
    Math.max(1, ...familyValues.map((v) => v.count))
  );

  // Most-prolific first: with a skewed catalog the ordering itself says
  // "who made all this", and the density bars carry the proportions.
  const creatorValues = $derived(
    deriveCreators(deps.pool)
      .map((name) => ({
        value: name,
        count: deps.getCount(BrowseFilterType.OWNER, name),
      }))
      .sort((a, b) => b.count - a.count)
  );
  const maxCreatorCount = $derived(
    Math.max(1, ...creatorValues.map((v) => v.count))
  );
  const creatorSamples = $derived(pickCreatorSamples(deps.pool, 3));
  const creatorAvatars = $derived(pickCreatorAvatars(deps.pool));
  const creatorTopThree = $derived(
    creatorValues.slice(0, 3).map((v) => v.value)
  );

  const recentCount = $derived(
    deps.getCount(BrowseFilterType.RECENT, "recent")
  );
  const performanceValues = $derived([
    {
      type: BrowseFilterType.PERFORMANCE_AVAILABILITY,
      value: "has-public-performance",
      label: "With a public performance",
      icon: "fa-circle-play",
      count: deps.getCount(
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        "has-public-performance"
      ),
      overallCount: applyFilter(
        [...deps.pool],
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        "has-public-performance"
      ).length,
    },
    {
      type: BrowseFilterType.PERFORMANCE_AVAILABILITY,
      value: "no-public-performance",
      label: "Without a public performance",
      icon: "fa-video",
      count: deps.getCount(
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        "no-public-performance"
      ),
      overallCount: applyFilter(
        [...deps.pool],
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        "no-public-performance"
      ).length,
    },
    {
      type: BrowseFilterType.RECENT_PERFORMANCE,
      value: "recent-performance",
      label: "Recently performed",
      icon: "fa-clock-rotate-left",
      count: deps.getCount(
        BrowseFilterType.RECENT_PERFORMANCE,
        "recent-performance"
      ),
      overallCount: applyFilter(
        [...deps.pool],
        BrowseFilterType.RECENT_PERFORMANCE,
        "recent-performance"
      ).length,
    },
  ]);
  const maxPerformanceCount = $derived(
    Math.max(1, ...performanceValues.map((v) => v.count))
  );
  const favoritesCount = $derived(
    deps.getCount(BrowseFilterType.FAVORITES, "favorites")
  );

  const collectionValues = $derived(
    (deps.collections ?? []).map((c) => ({
      ...c,
      count: deps.getCount(BrowseFilterType.COLLECTION, c.id),
    }))
  );
  const maxCollectionCount = $derived(
    Math.max(1, ...collectionValues.map((v) => v.count))
  );

  const loopDotColors = $derived(
    [...new Set(loopValues.map((v) => v.color))].slice(0, 4)
  );

  const sectionPresence = $derived<Record<string, boolean>>({
    letter: letterValues.length > 1,
    placement: placementValues.length > 1,
    gridmode: gridModeValues.length > 1,
    loop: loopValues.some((v) => v.count > 0),
    author: creatorValues.length > 1,
    performance: performanceValues.some((v) => v.count > 0),
    recent: recentCount > 0,
    favorites: favoritesCount > 0,
    family: familyValues.some((v) => v.count > 0),
    max_turn_intensity: maxTurnIntensityValues.length > 1,
  });
  const latchedSections = $state<Record<string, boolean>>({});
  $effect(() => {
    for (const [key, present] of Object.entries(sectionPresence)) {
      if (present && !latchedSections[key]) latchedSections[key] = true;
    }
  });
  // Stable option sets: categories never unmount mid-session; a narrowed-out
  // category dims with an explanation instead.
  const stableOptionSets = $derived(
    deps.unifiedFilterChooser || Boolean(deps.onToggleValue)
  );
  function showSection(key: string): boolean {
    return stableOptionSets
      ? Boolean(latchedSections[key]) || Boolean(sectionPresence[key])
      : Boolean(sectionPresence[key]);
  }
  function sectionNarrowedOut(key: string): boolean {
    return (
      stableOptionSets && Boolean(latchedSections[key]) && !sectionPresence[key]
    );
  }

  const letterSample = $derived(
    letterValues
      .slice(0, 3)
      .map((v) => v.value)
      .join("")
  );

  // Deterministic content peeks — same real sequences every visit.
  const levelReps = $derived(pickLevelRepresentatives(deps.pool, LEVELS));
  const lengthPair = $derived(pickLengthPair(deps.pool));
  const collage = $derived(pickCollage(deps.pool, 4));
  const collageSlots = $derived([0, 1, 2, 3].map((i) => collage[i]));

  const lengthSub = $derived(
    lengthPair.min !== undefined && lengthPair.max !== undefined
      ? `${lengthPair.min} to ${lengthPair.max} steps`
      : "Short to long"
  );

  const PEEK = $derived(
    deps.fluidWideCanvas && deps.drillWidth >= 2600
      ? PEEK_TIERS.cinema
      : deps.drillWidth >= 1600
        ? PEEK_TIERS.ultra
        : deps.drillWidth >= 900
          ? PEEK_TIERS.wide
          : deps.drillWidth >= 640
            ? PEEK_TIERS.mid
            : PEEK_TIERS.base
  );

  /** The two privileged doors — Level and Length. */
  const primaryCategories = $derived<CategoryEntry[]>([
    {
      key: "level",
      title: "Level",
      sub: "Beginner to advanced",
      art: { kind: "icon", icon: "fa-signal" },
      section: "level",
      narrowedOut: false,
    },
    {
      key: "length",
      title: "Length",
      sub: lengthSub,
      art: { kind: "icon", icon: "fa-ruler-horizontal" },
      section: "length",
      narrowedOut: false,
    },
  ]);

  /** Everything else, in the order the landing and the rail both use. */
  const secondaryCategories = $derived.by<CategoryEntry[]>(() => {
    const out: CategoryEntry[] = [];
    if (showSection("letter")) {
      out.push({
        key: "letter",
        title: "Starting letter",
        sub: sectionNarrowedOut("letter")
          ? "No matches with this rule"
          : `${letterValues.length} letters`,
        art: { kind: "glyph", word: letterSample },
        section: "letter",
        narrowedOut: sectionNarrowedOut("letter"),
      });
    }
    if (showSection("placement")) {
      out.push({
        key: "placement",
        title: "Start placement",
        sub: sectionNarrowedOut("placement")
          ? "No matches with this rule"
          : "Alpha, beta, gamma",
        art: {
          kind: "plate",
          src: placementValues[0]?.img ?? PLACEMENTS[0]!.img,
        },
        section: "placement",
        narrowedOut: sectionNarrowedOut("placement"),
      });
    }
    if (showSection("gridmode")) {
      out.push({
        key: "gridmode",
        title: "Grid mode",
        sub: sectionNarrowedOut("gridmode")
          ? "Narrowed out by this rule"
          : "Diamond or box",
        art: { kind: "grid" },
        section: "gridmode",
        narrowedOut: sectionNarrowedOut("gridmode"),
      });
    }
    if (showSection("loop")) {
      out.push({
        key: "loop",
        title: "LOOPs",
        sub: sectionNarrowedOut("loop")
          ? "No matches with this rule"
          : "Mirrored, rotated, swapped…",
        art: { kind: "dots", colors: loopDotColors },
        section: "loop",
        narrowedOut: sectionNarrowedOut("loop"),
      });
    }
    if (showSection("author")) {
      out.push({
        key: "author",
        title: "Creator",
        sub: sectionNarrowedOut("author")
          ? "No matches with this rule"
          : `${creatorValues.length} creators`,
        art: { kind: "avatars", names: creatorTopThree },
        section: "author",
        narrowedOut: sectionNarrowedOut("author"),
      });
    }
    if (showSection("performance")) {
      const withPerformance = performanceValues[0]?.count ?? 0;
      const waiting = performanceValues[1]?.count ?? 0;
      out.push({
        key: "performance",
        title: "Performances",
        sub: sectionNarrowedOut("performance")
          ? "No matches with this rule"
          : `${withPerformance} with video · ${waiting} without in results`,
        art: { kind: "icon", icon: "fa-circle-play" },
        section: "performance",
        narrowedOut: sectionNarrowedOut("performance"),
      });
    }
    if (showSection("recent")) {
      out.push({
        key: "recent",
        title: "Recently added",
        sub: sectionNarrowedOut("recent")
          ? "No matches with this rule"
          : deps.unifiedFilterChooser
            ? `Sequences added in the last 30 days · ${recentCount} · applies instantly`
            : `Sequences added in the last 30 days · ${recentCount}`,
        art: { kind: "icon", icon: "fa-clock-rotate-left" },
        apply: {
          type: BrowseFilterType.RECENT,
          value: "recent",
          label: "Recently added",
        },
        narrowedOut: sectionNarrowedOut("recent"),
      });
    }
    if (showSection("favorites")) {
      out.push({
        key: "favorites",
        title: "Favorites",
        sub: sectionNarrowedOut("favorites")
          ? "No matches with this rule"
          : deps.unifiedFilterChooser
            ? `${favoritesCount} saved · applies instantly`
            : `${favoritesCount} saved`,
        art: { kind: "icon", icon: "fa-heart" },
        apply: {
          type: BrowseFilterType.FAVORITES,
          value: "favorites",
          label: "Favorites",
        },
        narrowedOut: sectionNarrowedOut("favorites"),
      });
    }
    if (showSection("family")) {
      out.push({
        key: "family",
        title: "Timing & Direction",
        sub: sectionNarrowedOut("family")
          ? "No matches with this rule"
          : "The six families",
        art: {
          kind: "dots",
          colors: TND_ELEMENTS.map((el) => el.accentColor),
        },
        section: "family",
        narrowedOut: sectionNarrowedOut("family"),
      });
    }
    if (showSection("max_turn_intensity")) {
      out.push({
        key: "max_turn_intensity",
        title: "Max turn intensity",
        sub: sectionNarrowedOut("max_turn_intensity")
          ? "Narrowed out by this rule"
          : `${maxTurnIntensityValues.length} levels`,
        // A gauge, not a rotation glyph: `fa-arrows-spin` is what the LOOPs
        // "Rotated (quartered)" type wears, so this category was reading as a
        // second loop filter. Turn INTENSITY is a quantity — how much rotation
        // a sequence is allowed — which is what a gauge says.
        art: { kind: "icon", icon: "fa-gauge-high" },
        section: "max_turn_intensity",
        narrowedOut: sectionNarrowedOut("max_turn_intensity"),
      });
    }
    if (deps.showCollections) {
      const filterable = (deps.collections?.length ?? 0) > 0;
      out.push({
        key: "collections",
        title: "Collections",
        sub: filterable
          ? `${deps.collections!.length} to filter by`
          : "Curated by the community",
        art: { kind: "icon", icon: "fa-folder" },
        section: filterable ? "collection" : undefined,
        navigate: filterable ? undefined : "collections",
        narrowedOut: false,
      });
    }
    return out;
  });

  return {
    get levelValues() {
      return levelValues;
    },
    get maxLevelCount() {
      return maxLevelCount;
    },
    get lengthValues() {
      return lengthValues;
    },
    get maxLengthCount() {
      return maxLengthCount;
    },
    get maxTurnIntensityValues() {
      return maxTurnIntensityValues;
    },
    get maxTurnIntensityCount() {
      return maxTurnIntensityCount;
    },
    get letterValues() {
      return letterValues;
    },
    get placementValues() {
      return placementValues;
    },
    get maxPlacementCount() {
      return maxPlacementCount;
    },
    get startPlacementPictographs() {
      return startPlacementPictographs;
    },
    get gridModeValues() {
      return gridModeValues;
    },
    get maxGridModeCount() {
      return maxGridModeCount;
    },
    get performanceValues() {
      return performanceValues;
    },
    get maxPerformanceCount() {
      return maxPerformanceCount;
    },
    get loopValues() {
      return loopValues;
    },
    get maxLoopCount() {
      return maxLoopCount;
    },
    get familyValues() {
      return familyValues;
    },
    get maxFamilyCount() {
      return maxFamilyCount;
    },
    get creatorValues() {
      return creatorValues;
    },
    get maxCreatorCount() {
      return maxCreatorCount;
    },
    get collectionValues() {
      return collectionValues;
    },
    get maxCollectionCount() {
      return maxCollectionCount;
    },
    get creatorSamples() {
      return creatorSamples;
    },
    get creatorAvatars() {
      return creatorAvatars;
    },
    get levelReps() {
      return levelReps;
    },
    get lengthPair() {
      return lengthPair;
    },
    get collageSlots() {
      return collageSlots;
    },
    get lengthSub() {
      return lengthSub;
    },
    get PEEK() {
      return PEEK;
    },
    get primaryCategories() {
      return primaryCategories;
    },
    get secondaryCategories() {
      return secondaryCategories;
    },
  };
}

export type GalleryCatalog = ReturnType<typeof createGalleryCatalog>;
