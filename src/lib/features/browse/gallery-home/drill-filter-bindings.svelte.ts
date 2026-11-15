/**
 * How a gallery drill adds and removes filters on a Browse engine.
 *
 * The workspace (FilterWorkspace), the phone Filters sheet
 * (GalleryFilterSheet) and the desktop menu row (GalleryMenuRow) all host the
 * same drill over the same engine. Each used to carry its own copy of the
 * stacking rules below; this is the one copy.
 *
 * Stacking categories (LOOPs, T&D families, and the OR-stacking set) key one
 * filter per value; single-valued ones key by bare type, because re-adding
 * replaces. Removing the wrong key is a SILENT no-op, so removal looks up
 * whichever key the engine actually holds.
 */
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
import {
  trackBrowseFilterApplied,
  type BrowseFilterSurface,
} from "#lib/shared/analytics/browse-events.js";

const DEFAULT_CHIP_COLOR = "#6aa0ff";

export interface DrillFilterBindingOptions {
  /** Browse's filter path names its surface, and every apply and clear made
   * through these bindings sends `browse_filter_applied` from here: the one
   * place values are applied. Hosts outside that path (pickers, builders)
   * omit it and send nothing. A getter, because one host can serve two
   * surfaces (the ask screen opened from an answer button). */
  surface?: () => BrowseFilterSurface | null;
}

export function createDrillFilterBindings(
  getEngine: () => BrowseEngine,
  options: DrillFilterBindingOptions = {}
) {
  function track(
    type: BrowseFilterType,
    value: string | number,
    action: "apply" | "clear"
  ): void {
    const surface = options.surface?.();
    if (!surface) return;
    trackBrowseFilterApplied({
      filter: String(type),
      value,
      action,
      surface,
      result_count: getEngine().resultCount,
    });
  }

  const keyByValue = (type: BrowseFilterType) =>
    new Map(
      [...getEngine().activeFilters]
        .filter(([, f]) => f.type === type && !f.locked)
        .map(([key, f]) => [String(f.value), key])
    );

  const loopKeyByValue = $derived(keyByValue(BrowseFilterType.LOOP_TYPE));
  const familyKeyByValue = $derived(keyByValue(BrowseFilterType.TND_FAMILY));
  const activeLoopValues = $derived(new Set(loopKeyByValue.keys()));
  const activeFamilyValues = $derived(new Set(familyKeyByValue.keys()));
  const appliedValueKeys = $derived(
    new Set(
      [...getEngine().activeFilters.values()]
        .filter((f) => !f.locked)
        .map((f) => `${f.type}:${String(f.value)}`)
    )
  );

  function add(
    type: BrowseFilterType,
    value: string | number,
    label: string,
    color?: string
  ): void {
    getEngine().addFilter(type, value, label, color ?? DEFAULT_CHIP_COLOR);
    track(type, value, "apply");
  }

  /** Runs a removal on the engine and sends one clear per user filter it
   * took away, read from the engine before and after, so a bare-type key
   * that clears a whole stacked category reports each value. */
  function clearTracked(mutate: (engine: BrowseEngine) => void): void {
    const engine = getEngine();
    const before = [...engine.activeFilters].filter(([, f]) => !f.locked);
    mutate(engine);
    const after = engine.activeFilters;
    for (const [key, f] of before) {
      if (!after.has(key)) track(f.type, f.value as string | number, "clear");
    }
  }

  return {
    get activeLoopValues(): ReadonlySet<string> {
      return activeLoopValues;
    },
    get activeFamilyValues(): ReadonlySet<string> {
      return activeFamilyValues;
    },
    isValueApplied(type: BrowseFilterType, value: string | number): boolean {
      return appliedValueKeys.has(`${type}:${String(value)}`);
    },
    /** Add one value (a stacking category keeps the others). */
    add,
    /** Pick exactly one value for a category: every value already applied
     * for it goes, then this one is added. The Level and Length menus. */
    replace(
      type: BrowseFilterType,
      value: string | number,
      label: string,
      color?: string
    ): void {
      const engine = getEngine();
      engine.removeFilter(String(type));
      add(type, value, label, color);
    },
    /** Remove by engine key: a rule chip's ×, or a bare type that clears
     * its whole category. */
    removeKey(key: string): void {
      clearTracked((engine) => engine.removeFilter(key));
    },
    /** The "Show all" reset: every user filter goes, one clear each. */
    clearAll(): void {
      clearTracked((engine) => engine.clearUserFilters());
    },
    /** Any category: tap toggles the value in the rule. */
    toggleValue(
      type: BrowseFilterType,
      value: string | number,
      label: string,
      color: string | undefined,
      nowActive: boolean
    ): void {
      if (nowActive) {
        add(type, value, label, color);
        return;
      }
      const engine = getEngine();
      const perValue = `${type}:${String(value)}`;
      engine.removeFilter(
        engine.activeFilters.has(perValue) ? perValue : String(type)
      );
      track(type, value, "clear");
    },
    toggleLoop(
      value: string,
      label: string,
      color: string,
      nowActive: boolean
    ): void {
      if (nowActive) {
        getEngine().addFilter(BrowseFilterType.LOOP_TYPE, value, label, color);
        track(BrowseFilterType.LOOP_TYPE, value, "apply");
      } else {
        const key = loopKeyByValue.get(value);
        if (!key) return;
        getEngine().removeFilter(key);
        track(BrowseFilterType.LOOP_TYPE, value, "clear");
      }
    },
    toggleFamily(
      familyId: string,
      label: string,
      color: string,
      nowActive: boolean
    ): void {
      if (nowActive) {
        getEngine().addFilter(
          BrowseFilterType.TND_FAMILY,
          familyId,
          label,
          color
        );
        track(BrowseFilterType.TND_FAMILY, familyId, "apply");
      } else {
        const key = familyKeyByValue.get(familyId);
        if (!key) return;
        getEngine().removeFilter(key);
        track(BrowseFilterType.TND_FAMILY, familyId, "clear");
      }
    },
  };
}

export type DrillFilterBindings = ReturnType<typeof createDrillFilterBindings>;
