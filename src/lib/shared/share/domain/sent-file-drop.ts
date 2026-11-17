/**
 * Decisions for a file dragged onto the window, kept out of the component so
 * they can be tested without a browser.
 *
 * The window is the last stop for a drop. Every screen with its own drop zone
 * (video upload, image upload, the feedback board) handles the event first and
 * calls `preventDefault()`, so a drop that arrives here already taken is left
 * alone. A native file input takes a drop as its default action, so a drop on
 * one is left alone too.
 */

type DragLike = Pick<DragEvent, "defaultPrevented" | "dataTransfer" | "target">;

/** True while the drag carries files from the device, not text or a link. */
export function dragCarriesFiles(event: Pick<DragEvent, "dataTransfer">): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

function isFileInput(target: EventTarget | null): boolean {
  const element = target as Partial<HTMLInputElement> | null;
  return element?.nodeName === "INPUT" && element.type === "file";
}

/** Whether the window should claim this drag (allow the drop, block navigation). */
export function windowShouldClaim(event: DragLike): boolean {
  return (
    !event.defaultPrevented && dragCarriesFiles(event) && !isFileInput(event.target)
  );
}

/** The file to open from a drop at the window, or null to leave the drop alone. */
export function fileForWindowDrop(event: DragLike): File | null {
  if (!windowShouldClaim(event)) return null;
  return event.dataTransfer?.files?.[0] ?? null;
}
