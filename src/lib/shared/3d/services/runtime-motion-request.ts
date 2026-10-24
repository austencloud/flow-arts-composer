import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** One download owns exactly the score visible when it began. */
export class RuntimeMotionRequest {
  readonly sequence: SequenceData;
  private readonly sourceJson: string;
  private cancelled = false;

  constructor(sequence: SequenceData) {
    this.sourceJson = JSON.stringify(sequence);
    this.sequence = JSON.parse(this.sourceJson) as SequenceData;
  }

  matches(sequence: SequenceData): boolean {
    return !this.cancelled && JSON.stringify(sequence) === this.sourceJson;
  }

  cancel(): void {
    this.cancelled = true;
  }
}
