/**
 * What the effect picker's On / Off switch sets. On means an effect is
 * drawing: switching it off sets no effect, and switching it back on brings
 * back the effect that was last on in this preview, or the list's first effect
 * where none has been.
 */
export function effectsToggleTarget({
  active,
  lastOn,
  first,
}: {
  /** The effect drawing now, or "none". */
  active: string;
  /** The effect that was last on, if any was. */
  lastOn: string | null;
  /** The first effect in the list. */
  first: string | undefined;
}): string {
  if (active !== "none") return "none";
  return lastOn && lastOn !== "none" ? lastOn : (first ?? "none");
}
