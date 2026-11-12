import { getContext, setContext } from "svelte";

/**
 * Whether the stage's direction cues show (see
 * `environments/domain/stage-direction-cues.ts`). A film recording turns them
 * off, since on a finished film they read as instrumentation drawn over the
 * set. The deck itself always stays.
 *
 * The viewer scene sets this once; each place that draws cues reads it. A
 * component outside a viewer gets the default, cues shown.
 */
const STAGE_DIRECTION_CUES = Symbol("stage-direction-cues");

export function setStageDirectionCuesContext(shown: () => boolean): void {
  setContext(STAGE_DIRECTION_CUES, shown);
}

/** A reactive getter: read it inside `$derived` or `$effect`. */
export function getStageDirectionCuesShown(): () => boolean {
  return (
    getContext<(() => boolean) | undefined>(STAGE_DIRECTION_CUES) ??
    (() => true)
  );
}
