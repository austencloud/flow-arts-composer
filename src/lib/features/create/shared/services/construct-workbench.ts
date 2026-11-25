/**
 * The LOOP tab is Construct with a LOOP goal on top. It works on Construct's
 * own sequence with Construct's pickers, step editor, undo and Play, so
 * whatever was built in one tab shows in the other. Anything that asks "is
 * this Construct?" to decide how the workspace behaves asks this instead.
 */
export function isConstructWorkbench(tab: string | null | undefined): boolean {
  return tab === "construct" || tab === "loop";
}
