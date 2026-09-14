/**
 * Which way a disassembled canvas lays out its hero and the two single-hand
 * canvases. `stacked` puts the pair under the hero (a 2:3 block); `sidecar`
 * puts them in a column beside it (a 3:2 block). Neither fits every host, so
 * `auto` compares what each would give the hero and takes the larger.
 */

export type DisassemblyArrangement = "stacked" | "sidecar";

export interface DisassemblyHostBox {
  width: number;
  height: number;
  /** Word header + transport height reserved above and below the canvases. */
  chromeHeight: number;
}

/** A live arrangement only flips when the other one wins by this much. */
export const DISASSEMBLY_FLIP_HYSTERESIS = 0.1;

/** Side length of the hero square the arrangement would produce in the box. */
export function heroSizeFor(
  arrangement: DisassemblyArrangement,
  box: DisassemblyHostBox
): number {
  const usableHeight = Math.max(0, box.height - box.chromeHeight);
  const width = Math.max(0, box.width);
  return arrangement === "stacked"
    ? Math.min(width, (usableHeight * 2) / 3)
    : Math.min((width * 2) / 3, usableHeight);
}

/**
 * The arrangement to use for a measured host. With no current arrangement
 * the larger hero wins and ties go to stacked. With one, the other must beat
 * it by the hysteresis margin, so a divider dragged near break-even cannot
 * flap the layout back and forth.
 */
export function resolveDisassemblyArrangement(
  box: DisassemblyHostBox,
  current: DisassemblyArrangement | null,
  hysteresis = DISASSEMBLY_FLIP_HYSTERESIS
): DisassemblyArrangement {
  if (!(box.width > 0) || !(box.height > 0)) return current ?? "stacked";
  const stacked = heroSizeFor("stacked", box);
  const sidecar = heroSizeFor("sidecar", box);
  if (current === null) return sidecar > stacked ? "sidecar" : "stacked";
  const other: DisassemblyArrangement =
    current === "stacked" ? "sidecar" : "stacked";
  const currentSize = current === "stacked" ? stacked : sidecar;
  const otherSize = current === "stacked" ? sidecar : stacked;
  return otherSize > currentSize * (1 + hysteresis) ? other : current;
}
