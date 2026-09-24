/**
 * Arrow Placement Data Service
 *
 * Loads and manages arrow placement JSON data for positioning calculations.
 * Ports the exact functionality from desktop DefaultPlacer.
 */

import type { MotionType } from "../../../../shared/domain/enums/pictograph-enums";
import { placementAssetRoot, PlacementFrame } from "../domain/placement-frame";
import { GridMode } from "../../../../grid/domain/enums/grid-enums";
import { jsonCache } from "$lib/shared/pictograph/shared/services/simple-json-cache";
import type { SimpleJsonCache } from "$lib/shared/pictograph/shared/services/simple-json-cache";
import type {
  GridPlacementData,
  JsonPlacementData,
} from "../domain/models/placement-data-types";
/**
 * Optional Firestore-first override for default base adjustments. Registered by
 * default-override-singleton on init. Unset in workers / pre-auth → pure JSON.
 * Returns the stored base [x, y] or null to fall through to the static map.
 */
export type DefaultOverrideResolver = (
  placementFrame: string,
  motionType: string,
  placementKey: string,
  turns: string,
  propType: string
) => [number, number] | null;

let defaultOverrideResolver: DefaultOverrideResolver | null = null;

export function setDefaultOverrideResolver(
  fn: DefaultOverrideResolver | null
): void {
  defaultOverrideResolver = fn;
}

/**
 * Bucket keys for halved-arrow (segment) default-tier placements. Siblings of
 * MotionType, not members of it — a half-motion frame is letterless and looked
 * up by its own bucket ("pro_half" etc.), never by extending motionTypes.
 */
export type SegmentPlacementKey =
  | "pro_half"
  | "anti_half"
  | "dash_half"
  | "static_half";

export class ArrowPlacer {
  private jsonCacheImpl: SimpleJsonCache;

  // [placementFrame][propType][motionType][placementKey][turns] = [x, y]
  private allPlacements: Record<string, Record<string, GridPlacementData>> = {};

  // Lazily-loaded authored-frame/prop buckets, e.g. "canonical:fan".
  private loadedKeys = new Set<string>();

  // Buckets whose load is in flight, keyed the same way. Collapses the N
  // concurrent ensureLoaded calls a pictograph grid fires into one load.
  private loadingBuckets = new Map<string, Promise<void>>();

  // Props with their own seeded subfolder. Anything else resolves to staff root.
  // MUST stay in sync with SEED_PROPS in scripts/seed-prop-default-placements.mjs —
  // a prop listed here but not seeded there reads a <prop>/ folder that doesn't
  // exist (silent staff fallback), and vice-versa.
  private static readonly SEEDED_PROPS = new Set([
    "fan",
    "bigfan",
    "club",
    "bigclub",
    "triad",
    "bigtriad",
    "minihoop",
    "bighoop",
    "triangle",
    "buugeng",
    "bigbuugeng",
    "doublestar",
    "bigdoublestar",
    "eightrings",
    "bigeightrings",
  ]);

  private readonly motionTypes = [
    "pro",
    "anti",
    "float",
    "dash",
    "static",
  ] as const;

  // Sibling bucket for halved-arrow default placements — NOT added to
  // motionTypes above. A half-motion frame is letterless, so it never goes
  // through the letter tiers; it reads its own pro_half/anti_half/dash_half/
  // static_half file instead. float has no half variant (no shift-turns
  // concept to split).
  private readonly segmentMotionTypes = [
    "pro_half",
    "anti_half",
    "dash_half",
    "static_half",
  ] as const;

  /** Resolve the motion-type file paths for a canonical prop bucket. Seeded
   *  props read their <prop>/ subfolder; staff and unseeded props read root.
   *  The 4 _half segment files are staff-root only (v1) — seeded prop buckets
   *  skip them so a prop bucket doesn't fire 4 spurious missing-file warnings
   *  for data that hasn't been authored per-prop yet. Segment files are also
   *  grid-mode-invariant: every display grid reads the same authored files. */
  private filesFor(propType: string): Record<string, string> {
    const assetRoot = placementAssetRoot(PlacementFrame.CANONICAL);
    const seeded = ArrowPlacer.SEEDED_PROPS.has(propType);
    const sub = seeded ? `${propType}/` : "";
    const files: Record<string, string> = {};
    for (const mt of this.motionTypes) {
      files[mt] = `${assetRoot}/default/${sub}default_${mt}_placements.json`;
    }
    if (sub === "") {
      for (const mt of this.segmentMotionTypes) {
        // Segment (half-motion) nudges are authored GLYPH-LOCAL and are
        // grid-mode-invariant by design (arrow-positioning-orchestrator.ts
        // rotates one local value with the glyph): a single (motionType, turns)
        // value serves every location/direction/grid. The canonical files are
        // the single source of truth; display-grid copies must not exist (a second source
        // would contradict the coverage oracle and the WASD authoring harness,
        // both diamond-only on purpose).
        files[mt] = `${assetRoot}/default/default_${mt}_placements.json`;
      }
    }
    return files;
  }

  /**
   * Create ArrowPlacer with optional injectable JSON cache
   * @param jsonCacheImpl JSON cache implementation (defaults to browser fetch-based cache)
   */
  constructor(jsonCacheImpl?: SimpleJsonCache) {
    this.jsonCacheImpl = jsonCacheImpl ?? jsonCache;
  }

  /**
   * Load all canonical staff placement data from JSON files.
   * @deprecated Use ensureLoaded(gridMode, propType) for lazy prop-aware loading
   */
  async loadPlacementData(): Promise<void> {
    await this.ensureLoaded(GridMode.DIAMOND, "staff");
  }

  /**
   * Ensure placement data is loaded for a specific (grid mode, prop type).
   * Diamond and Box alias the same canonical bucket. SKEWED also preloads that one
   * authored source; its mixed-grid tuple behavior remains downstream.
   */
  async ensureLoaded(gridMode: GridMode, propType: string): Promise<void> {
    void gridMode;
    const placementFrame = PlacementFrame.CANONICAL;
    const key = `${placementFrame}:${propType}`;
    if (this.loadedKeys.has(key)) return;
    // In-flight dedup mirrors SimpleJsonCache.loadingPromises: a grid of N
    // pictographs mounts N concurrent ensureLoaded calls for the same bucket
    // before any of them finishes, and without this every one of them fans out
    // its own file loads.
    let inFlight = this.loadingBuckets.get(key);
    if (!inFlight) {
      inFlight = this.loadPlacements(placementFrame, propType)
        .then(() => {
          this.loadedKeys.add(key);
        })
        .finally(() => {
          this.loadingBuckets.delete(key);
        });
      this.loadingBuckets.set(key, inFlight);
    }
    await inFlight;
  }

  /** Back-compat: staff-scoped load. Prefer ensureLoaded(gridMode, propType). */
  async ensureGridModeLoaded(gridMode: GridMode): Promise<void> {
    await this.ensureLoaded(gridMode, "staff");
  }

  private async loadPlacements(
    placementFrame: PlacementFrame,
    propType: string
  ): Promise<void> {
    const files = this.filesFor(propType);
    this.allPlacements[placementFrame] ??= {};
    const byMotion: GridPlacementData = {};
    for (const [motionType, filePath] of Object.entries(files)) {
      const raw = await this.loadJsonFile(filePath);
      const filtered: GridPlacementData[string] = {};
      for (const [placementKey, turnsData] of Object.entries(raw ?? {})) {
        filtered[placementKey] = {};
        for (const [turns, coords] of Object.entries(turnsData ?? {})) {
          if (
            Array.isArray(coords) &&
            coords.length === 2 &&
            typeof coords[0] === "number" &&
            typeof coords[1] === "number"
          ) {
            filtered[placementKey][turns] = coords as unknown as [
              number,
              number,
            ];
          }
        }
      }
      byMotion[motionType] = filtered;
    }
    this.allPlacements[placementFrame][propType] = byMotion;
  }

  /**
   * Load JSON file with caching
   */
  private async loadJsonFile(path: string): Promise<JsonPlacementData> {
    return (await this.jsonCacheImpl.get(path)) as JsonPlacementData;
  }

  /**
   * Get default adjustment using placement key and turns
   */
  async getDefaultAdjustment(
    motionType: MotionType | SegmentPlacementKey,
    placementKey: string,
    turns: number | string,
    gridMode: GridMode = GridMode.DIAMOND,
    propType: string = "staff"
  ): Promise<{ x: number; y: number }> {
    // SEEDED_PROPS holds lowercase keys; normalize once so a non-lowercased
    // caller can't silently miss its bucket and fall back to staff.
    // Classic Club is a visual build of the exact Club silhouette. Reuse the
    // authored Club arrow bucket instead of falling through to staff offsets.
    const requestedProp = propType.toLowerCase();
    const prop = requestedProp === "classic_club" ? "club" : requestedProp;
    const placementFrame = PlacementFrame.CANONICAL;
    await this.ensureLoaded(gridMode, prop);
    const turnsStr = this.formatTurnsForLookup(turns);

    // Firestore-first: an admin default override shadows the static JSON value.
    const override = defaultOverrideResolver
      ? defaultOverrideResolver(
          placementFrame,
          motionType as unknown as string,
          placementKey,
          turnsStr,
          prop
        )
      : null;
    if (override) return { x: override[0], y: override[1] };

    const adjustment =
      this.allPlacements[placementFrame]?.[prop]?.[motionType]?.[
        placementKey
      ]?.[turnsStr];
    // Quarter-turn glyphs are authored around their canonical arrow-location
    // anchor. A midpoint between the 0-turn and half-turn placement tables is
    // not geometrically meaningful: those legacy assets have different bounds
    // and collision envelopes. An exact authored 0.25 entry (or a higher
    // placement tier) still wins above; otherwise keep the canonical anchor.
    if (!adjustment) return { x: 0, y: 0 };
    return { x: adjustment[0], y: adjustment[1] };
  }

  // The enumeration/debug helpers below are intentionally staff-scoped: they
  // back editor key-listing, and seeded prop datasets are byte-copies of staff
  // (identical key sets). If a prop dataset ever diverges in its KEY set (not
  // just values), thread propType through these too.

  /**
   * Get available placement keys for a motion type
   */
  async getAvailablePlacementKeys(
    motionType: MotionType,
    gridMode: GridMode = GridMode.DIAMOND
  ): Promise<string[]> {
    await this.ensureLoaded(gridMode, "staff");

    const motionPlacements =
      this.allPlacements[PlacementFrame.CANONICAL]?.["staff"]?.[motionType];
    if (!motionPlacements) {
      return [];
    }

    return Object.keys(motionPlacements);
  }

  /**
   * Check if the canonical staff data has been loaded.
   */
  isLoaded(gridMode?: GridMode): boolean {
    void gridMode;
    return this.loadedKeys.has(`${PlacementFrame.CANONICAL}:staff`);
  }

  /**
   * Format turns value for JSON lookup
   * Converts: 1.0 → "1", 0.5 → "0.5", etc.
   */
  private formatTurnsForLookup(turns: number | string): string {
    if (typeof turns === "string") {
      return turns; // Already formatted (e.g., "fl" for float)
    }

    // Convert numbers: remove .0 for whole numbers
    if (turns === Math.floor(turns)) {
      return Math.floor(turns).toString();
    }

    return turns.toString();
  }

  /**
   * Debug method to log available keys
   */
  async debugAvailableKeys(
    motionType: MotionType,
    gridMode: GridMode = GridMode.DIAMOND
  ): Promise<string[]> {
    const keys = await this.getAvailablePlacementKeys(motionType, gridMode);
    return keys;
  }

  /**
   * Get raw placement data for debugging
   */
  async getPlacementData(
    motionType: MotionType,
    placementKey: string,
    gridMode: GridMode = GridMode.DIAMOND
  ): Promise<{ [turns: string]: [number, number] }> {
    await this.ensureLoaded(gridMode, "staff");

    const motionPlacements =
      this.allPlacements[PlacementFrame.CANONICAL]?.["staff"]?.[motionType];
    return motionPlacements?.[placementKey] || {};
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
// Use this instead of arrowPlacer to avoid DI container rebuilds.
// Uses the default jsonCache singleton.
// ============================================================================

export const arrowPlacer = new ArrowPlacer();
