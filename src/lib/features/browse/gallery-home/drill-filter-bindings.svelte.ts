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

const DEFAULT_CHIP_COLOR = "#6aa0ff";

export function createDrillFilterBindings(getEngine: () => BrowseEngine) {
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
    },
    toggleLoop(
      value: string,
      label: string,
      color: string,
      nowActive: boolean
    ): void {
      if (nowActive) {
        getEngine().addFilter(BrowseFilterType.LOOP_TYPE, value, label, color);
      } else {
        const key = loopKeyByValue.get(value);
        if (key) getEngine().removeFilter(key);
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
      } else {
        const key = familyKeyByValue.get(familyId);
        if (key) getEngine().removeFilter(key);
      }
    },
  };
}

export type DrillFilterBindings = ReturnType<typeof createDrillFilterBindings>;
