import type {
  SortMethod,
  TypeFilter,
} from "../domain/option-picker-types";

export interface IFilterPersister {
  saveFilters(
    sortMethod: SortMethod,
    typeFilter: TypeFilter,
    endPlacementFilter: Record<string, boolean>,
    reversalFilter: Record<string, boolean>,
    isContinuousOnly?: boolean
  ): void;
  loadFilters(): {
    sortMethod: SortMethod;
    typeFilter: TypeFilter;
    endPlacementFilter: Record<string, boolean>;
    reversalFilter: Record<string, boolean>;
    isContinuousOnly: boolean;
  } | null;
  saveContinuousOnly(value: boolean): void;
  loadContinuousOnly(): boolean;
  clearFilters(): void;
}

export class FilterPersister implements IFilterPersister {
  private readonly STORAGE_KEY = "tka-option-picker-filters";
  private readonly CONTINUOUS_KEY = "tka-option-picker-continuous";

  saveFilters(
    sortMethod: SortMethod,
    typeFilter: TypeFilter,
    endPlacementFilter: Record<string, boolean>,
    reversalFilter: Record<string, boolean>,
    isContinuousOnly?: boolean
  ): void {
    try {
      const filterData = {
        sortMethod,
        typeFilter,
        endPlacementFilter,
        reversalFilter,
        isContinuousOnly: isContinuousOnly ?? false,
        timestamp: Date.now(),
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filterData));
    } catch (error) {
      console.warn("⚠️ FilterPersister: Failed to save filters:", error);
    }
  }

  saveContinuousOnly(value: boolean): void {
    try {
      localStorage.setItem(this.CONTINUOUS_KEY, JSON.stringify(value));
    } catch (error) {
      console.warn(
        "⚠️ FilterPersister: Failed to save continuous filter:",
        error
      );
    }
  }

  loadContinuousOnly(): boolean {
    try {
      const stored = localStorage.getItem(this.CONTINUOUS_KEY);
      if (!stored) {
        return false;
      }
      return JSON.parse(stored) === true;
    } catch (error) {
      console.warn(
        "⚠️ FilterPersister: Failed to load continuous filter:",
        error
      );
      return false;
    }
  }

  loadFilters(): {
    sortMethod: SortMethod;
    typeFilter: TypeFilter;
    endPlacementFilter: Record<string, boolean>;
    reversalFilter: Record<string, boolean>;
    isContinuousOnly: boolean;
  } | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const parsed: unknown = JSON.parse(stored);

      // Type guard to validate the parsed data
      if (!this.isValidFilterData(parsed)) {
        console.warn("⚠️ FilterPersister: Invalid filter data structure");
        return null;
      }

      // Pre-rename persisted data (before "position" -> "placement") used
      // endPositionFilter and the "endPosition" sortMethod value. Read both
      // spellings, write only the current ones.
      const legacy = parsed as unknown as {
        endPositionFilter?: Record<string, boolean>;
      };
      const rawSortMethod = String(parsed["sortMethod"]);
      const sortMethod = (
        rawSortMethod === "endPosition" ? "endPlacement" : rawSortMethod
      ) as SortMethod;

      return {
        sortMethod,
        typeFilter: parsed["typeFilter"],
        endPlacementFilter:
          parsed.endPlacementFilter ?? legacy.endPositionFilter ?? {},
        reversalFilter: parsed.reversalFilter ?? {},
        isContinuousOnly: parsed.isContinuousOnly ?? this.loadContinuousOnly(),
      };
    } catch (error) {
      console.warn("⚠️ FilterPersister: Failed to load filters:", error);
      return null;
    }
  }

  /**
   * Type guard for filter data validation
   */
  private isValidFilterData(obj: unknown): obj is {
    sortMethod: SortMethod;
    typeFilter: TypeFilter;
    endPlacementFilter?: Record<string, boolean>;
    reversalFilter?: Record<string, boolean>;
    isContinuousOnly?: boolean;
  } {
    if (!obj || typeof obj !== "object") return false;

    const data = obj as Record<string, unknown>;

    return (
      typeof data["sortMethod"] === "string" &&
      typeof data["typeFilter"] === "string"
    );
  }

  clearFilters(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.CONTINUOUS_KEY);
    } catch (error) {
      console.warn("⚠️ FilterPersister: Failed to clear filters:", error);
    }
  }
}

export const filterPersister = new FilterPersister();
