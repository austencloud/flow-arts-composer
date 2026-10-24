/**
 * Guide sequence adapter. The strip adapter moved to
 * src/lib/shared/guide-topics/strip-to-sequence.ts so the home hero can play
 * the same authored strips; this path stays as a re-export so the Guide pages
 * that import it from here keep working unchanged.
 */
export {
  bakeReversals,
  isStartBox,
  sequenceToStrip,
  stripToSequence,
} from "#lib/shared/guide-topics/strip-to-sequence.js";
