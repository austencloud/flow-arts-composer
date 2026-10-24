/**
 * Settings that cannot make a sequence at all: every start that fits the
 * chosen timing and direction is blocked, or the length does not split into
 * this LOOP's repeats. Nothing is broken, so the Generate panel shows the
 * message as a notice that says what to change, without the bug-report
 * dialog it keeps for real failures.
 *
 * `detail` is the engine's own sentence when it can say exactly why (a word
 * that cannot close, a swap that changes nothing). It is English and shown
 * as is beneath the headline.
 */
export class GenerationRequestError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "GenerationRequestError";
  }
}
