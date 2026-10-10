/**
 * Re-export of the foundation sequence-loopability checker.
 *
 * This file used to be a byte-for-byte duplicate; the foundation copy (which
 * also treats invisible placeholder hands like absent hands under the
 * both-required Step shape) is the single source of truth.
 */
export { isSeamlesslyLoopable } from "#lib/shared/foundation/services/sequence-loopability-checker.js";
