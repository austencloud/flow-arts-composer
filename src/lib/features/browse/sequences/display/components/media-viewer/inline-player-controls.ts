/** What InlineAnimationPlayer hands a host through `onControlsRef`. */
export interface InlinePlayerControls {
  /** Play once from the start (stops first if playing). */
  replay(): void;
  /** Stop on the end pose, as a finished single play rests. */
  restAtEnd(): void;
  /** True when the playhead rests past the final motion. */
  isAtEnd(): boolean;
}
