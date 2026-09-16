import { getContext, setContext } from "svelte";
import type { GuideChapterData } from "./guide-types";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const GUIDE_DATA_KEY = Symbol("guide-data");
const ACTIVE_SECTION_KEY = Symbol("active-section");
const PRINT_MODE_KEY = Symbol("guide-print-mode");
const SEQUENCE_CLICK_KEY = Symbol("guide-sequence-click");

export function setGuideData(data: GuideChapterData): void {
  setContext(GUIDE_DATA_KEY, data);
}

export function getGuideData(): GuideChapterData {
  return getContext<GuideChapterData>(GUIDE_DATA_KEY);
}

export function lookupPictograph(
  data: GuideChapterData,
  id: string
): PictographData | null {
  return data.pictographs[id] ?? null;
}

export function lookupSequence(
  data: GuideChapterData,
  id: string
): PictographData[] | null {
  return data.sequences[id] ?? null;
}

export function setActiveSectionContext(setter: (id: string) => void): void {
  setContext(ACTIVE_SECTION_KEY, setter);
}

export function getActiveSectionSetter(): ((id: string) => void) | null {
  return getContext<((id: string) => void) | null>(ACTIVE_SECTION_KEY) ?? null;
}

/** Set on the /print route so pictographs render eagerly (no IntersectionObserver,
 *  which never fires for off-screen elements in a long static print document). */
export function setGuidePrintMode(): void {
  setContext(PRINT_MODE_KEY, true);
}

export function getGuidePrintMode(): boolean {
  return getContext<boolean>(PRINT_MODE_KEY) ?? false;
}

/** Payload a page hands up when the user clicks one of its sequences. `key`
 *  uniquely identifies the strip (`"<page>-<stripIndex>"`) so the reader can
 *  scope the golden step ring to exactly the strip that's animating.
 *  `propType` picks the companion's animated prop - hand for the hand-motion
 *  chapters (default), staff for the staff pages (isolation/antispin strips
 *  animate real staves from their authored orientations). Widened (2026-07-10,
 *  guide/codex merge) to accept any PropType - the codex page lets the reader
 *  switch prop family (club, buugeng, triad, fan, mini hoop, hand); existing
 *  "hand"/"staff" string literals from other pages keep working unchanged. */
export type GuideSequenceClick = {
  strip: StepData[];
  word?: string;
  key?: string;
  propType?: "hand" | "staff" | PropType;
  /** Show the α/β/γ start→end position indicator on the companion animator for
   *  this strip. Defaults (when omitted) to on for hand renders - the early
   *  hand-path chapters - and off for staff/letter/word strips. Set explicitly
   *  to force it for a given example. */
  showPlacementGlyph?: boolean;
};

/** The reader registers a handler; pages call it to open the animation companion. */
export function setGuideSequenceClick(
  handler: (payload: GuideSequenceClick) => void
): void {
  setContext(SEQUENCE_CLICK_KEY, handler);
}

export function getGuideSequenceClick(): ((payload: GuideSequenceClick) => void) | null {
  return (
    getContext<((payload: GuideSequenceClick) => void) | null>(SEQUENCE_CLICK_KEY) ?? null
  );
}
