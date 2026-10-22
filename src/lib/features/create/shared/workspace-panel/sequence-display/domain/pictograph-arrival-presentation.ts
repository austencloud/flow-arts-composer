/**
 * Where the arrival stage plays a picked or held option.
 *
 * - `workspace`: inside the step grid, over the sequence it lands in.
 * - `screen`: over the whole screen. Construct's phone tier keeps the
 *   workspace to a short band above the option grid, where a stage card would
 *   be barely larger than the 50-70px cell it lands in, so the step plays at a
 *   readable size and then lands in its cell.
 */
export type PictographArrivalPresentation = "workspace" | "screen";

export function getPictographArrivalPresentation(params: {
  constructPhoneTier: boolean;
}): PictographArrivalPresentation {
  return params.constructPhoneTier ? "screen" : "workspace";
}

/**
 * A full-screen arrival must never hold up the next pick. Any tap during a
 * committed step's preview sends it straight to its cell; the tap itself goes
 * on to whatever is under it, since the overlay takes no pointer events.
 * Before the card has painted there is nothing to fly, so the step is placed.
 * A held audition ends with its own release, and a landing is already on its
 * way, so neither is interrupted.
 */
export function shouldInterruptArrivalOnTap(params: {
  presentation: PictographArrivalPresentation;
  intent: "commit" | "audition";
  phase: string;
}): boolean {
  return (
    params.presentation === "screen" &&
    params.intent === "commit" &&
    (params.phase === "preparing" ||
      params.phase === "entering" ||
      params.phase === "moving" ||
      params.phase === "holding")
  );
}
