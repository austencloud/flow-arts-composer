/**
 * The mandala a slow gallery card draws while its picture is on the way: the
 * very shape the finished card paints in its mandala cells (arc paths, the
 * props' tip count), so the drawing can land on the picture's own mandalas.
 *
 * The mandala workers make it, so a screen of slow cards costs the page
 * nothing. Where they cannot run, the page makes it in an idle moment.
 * Drawings are kept per sequence and tip count, so a card that scrolls back
 * draws at once, and a card asked twice shares one request.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { pairTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import { getMandalaPathOptions } from "#lib/shared/mandala/services/mandala-path-options.js";
import { mandalaWorkers } from "#lib/shared/mandala/services/mandala-workers.js";
import type { StepLike } from "#lib/shared/mandala/services/types.js";

/** Drawings kept; a few screens of cards. */
const KEPT = 160;

const kept = new Map<string, MandalaPaths>();
const asked = new Map<string, Promise<MandalaPaths | null>>();

function keyFor(
  sequence: SequenceData,
  leftPropType: PropType | undefined,
  rightPropType: PropType | undefined
): string | null {
  const steps = sequence.steps?.length ?? 0;
  if (steps === 0) return null;
  const identity = sequence.id || sequence.word || sequence.name;
  if (!identity) return null;
  return `${identity}|${steps}|${pairTipEnds(leftPropType, rightPropType)}`;
}

function keep(key: string, paths: MandalaPaths): void {
  kept.delete(key);
  kept.set(key, paths);
  while (kept.size > KEPT) kept.delete(kept.keys().next().value!);
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function make(
  steps: readonly StepLike[],
  tipEnds: 1 | 2
): Promise<MandalaPaths> {
  const options = getMandalaPathOptions("arc", tipEnds);
  const workers = mandalaWorkers();
  if (workers && !workers.broken) {
    try {
      const result = await workers.run(() => ({
        type: "paths",
        // stepsText's format, written here: its module carries the whole
        // geometry, which a card on a public page should not download.
        steps: JSON.stringify([steps]),
        options,
      }));
      if (result.type === "paths" && result.paths[0]) return result.paths[0];
    } catch {
      // A pool that cannot run hands the work back to the page.
    }
  }
  const { calculate } = await import(
    "#lib/shared/mandala/services/mandala-geometry-calculator.js"
  );
  await idle();
  return calculate(steps, undefined, undefined, options);
}

/** The drawing already made for this card, if any. */
export function peekCardMandalaPaths(
  sequence: SequenceData,
  leftPropType?: PropType,
  rightPropType?: PropType
): MandalaPaths | null {
  const key = keyFor(sequence, leftPropType, rightPropType);
  return key ? (kept.get(key) ?? null) : null;
}

/**
 * The card's mandala drawing. Null when the sequence has no steps to draw
 * from, or its drawing is empty.
 */
export function cardMandalaPaths(
  sequence: SequenceData,
  leftPropType?: PropType,
  rightPropType?: PropType
): Promise<MandalaPaths | null> {
  const key = keyFor(sequence, leftPropType, rightPropType);
  if (!key) return Promise.resolve(null);
  const ready = kept.get(key);
  if (ready) return Promise.resolve(ready);
  const waiting = asked.get(key);
  if (waiting) return waiting;

  const request = make(
    sequence.steps as readonly StepLike[],
    pairTipEnds(leftPropType, rightPropType)
  )
    .then((paths) => {
      if (paths.left.length === 0 && paths.right.length === 0) return null;
      keep(key, paths);
      return paths;
    })
    .catch(() => null)
    .finally(() => asked.delete(key));
  asked.set(key, request);
  return request;
}
