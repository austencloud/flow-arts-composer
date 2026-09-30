/**
 * Settings that cannot make a sequence at all: every start that fits the
 * chosen timing and direction is blocked, or the length does not split into
 * this LOOP's repeats. Nothing is broken, so the Generate panel shows the
 * message as a notice that says what to change, without the bug-report
 * dialog it keeps for real failures.
 */
export class GenerationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationRequestError";
  }
}
