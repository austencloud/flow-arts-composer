import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export type SequenceShareSource = SequenceData & {
  thumbnailUrl?: string;
};

export interface SequenceSharePayload {
  sequence: SequenceShareSource;
  sequenceId: string;
  sequenceWord: string;
  /** The raw word used as the cloud thumbnail storage key (sequence.word) */
  sequenceCloudWord?: string;
  sequenceName?: string;
  sequenceThumbnail?: string;
  /**
   * A transient, locally rendered Choreo Card for the send sheet preview.
   * This never becomes message metadata; sent messages only persist durable
   * URLs already present on `sequence`.
   */
  sequencePreviewBlob?: Blob;
  /**
   * A card render is in flight for this share. The sheet shows a preparing
   * state instead of a stale cloud thumbnail or an empty frame, and clears it
   * when the render settles either way.
   */
  sequencePreviewPending?: boolean;
  sequenceAuthor?: string;
  sequenceStepCount?: number;
}
