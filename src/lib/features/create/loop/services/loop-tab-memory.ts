import {
  LOOP_FAMILIES,
  loopFamily,
  type LoopFamily,
  type LoopVariant,
} from "../domain/loop-families";

/**
 * What the LOOP tab remembers on this device: the kind of LOOP a person last
 * chose, which steps on the grid are a LOOP made here, and whether they have
 * met the explainer. The steps themselves are Construct's and are kept with
 * Construct's. Storage can be full, blocked or wiped; every read and write
 * carries on without it.
 */

const FAMILY_KEY = "tka-loop-tab-family";
const SEEN_KEY = "tka-loop-tab-explained";
const MADE_KEY = "tka-loop-tab-made";

/** Enough to know a LOOP made here again after the page is reloaded. */
export interface MadeRecord {
  /** The steps the LOOP is made of, by their ids. */
  ids: string;
  family: LoopFamily;
  variant: LoopVariant;
  partLength: number;
}

export interface LoopTabMemory {
  loadFamily(): LoopFamily | null;
  saveFamily(family: LoopFamily): void;
  loadMade(): MadeRecord | null;
  saveMade(record: MadeRecord): void;
  hasSeenExplainer(): boolean;
  markExplainerSeen(): void;
}

export function createLoopTabMemory(): LoopTabMemory {
  return {
    loadFamily() {
      try {
        return readFamily(localStorage.getItem(FAMILY_KEY));
      } catch {
        return null;
      }
    },
    saveFamily(family) {
      try {
        localStorage.setItem(FAMILY_KEY, family);
      } catch {
        // The tab simply opens on Rotated next time.
      }
    },
    loadMade() {
      try {
        return readMade(localStorage.getItem(MADE_KEY));
      } catch {
        return null;
      }
    },
    saveMade(record) {
      try {
        localStorage.setItem(MADE_KEY, JSON.stringify(record));
      } catch {
        // After a reload the tab takes the LOOP for steps still being built.
      }
    },
    hasSeenExplainer() {
      try {
        return localStorage.getItem(SEEN_KEY) === "1";
      } catch {
        return false;
      }
    },
    markExplainerSeen() {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Meeting the explainer twice is harmless.
      }
    },
  };
}

/** A stored kind is only used when it is still one of the five. */
export function readFamily(raw: string | null): LoopFamily | null {
  return LOOP_FAMILIES.find(({ id }) => id === raw)?.id ?? null;
}

/** A stored LOOP is only used when its kind and its form still exist. */
export function readMade(raw: string | null): MadeRecord | null {
  if (!raw) return null;
  const stored = JSON.parse(raw) as Partial<MadeRecord> | null;
  const family = readFamily(stored?.family ?? null);
  const variant =
    family &&
    loopFamily(family).variants.find(
      ({ loopType, period }) =>
        loopType === stored?.variant?.loopType &&
        period === stored.variant.period
    );
  if (!family || !variant) return null;
  if (typeof stored?.ids !== "string" || !Number.isInteger(stored.partLength))
    return null;
  const partLength = stored.partLength as number;
  return partLength > 0
    ? { ids: stored.ids, family, variant, partLength }
    : null;
}
