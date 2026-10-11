import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export interface ConstructOptionAudition {
  readonly sequence: SequenceData;
  /**
   * Primitive token for the active document that produced this audition.
   * Sequence objects pass through Svelte proxies, so their identity is not a
   * safe invalidation signal.
   */
  readonly sourceSequenceRevision: number;
  /** One-based regular step number. */
  readonly stepNumber: number;
  /** Increments for every option activation, including repeated auditions. */
  readonly requestId: number;
  /** Timestamp captured at option activation for preview-start measurements. */
  readonly activatedAt: number;
}
