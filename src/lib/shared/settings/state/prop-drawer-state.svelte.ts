/**
 * Global prop drawer state
 *
 * Shared reactive state for the prop selection drawer.
 * Used by PropIndicatorButton (to open) and keyboard shortcuts (P key to toggle).
 * The actual PropSelectionSheet is mounted at the CreateModule level
 * to avoid stacking context issues with the workspace panel.
 */

let isOpen = $state(false);
// How many app shells currently mount the sheet. Standalone pages (a shared
// sequence link, an embed) have none, so a viewer there keeps its own picker
// rather than routing to a switcher that would never appear.
let hosts = $state(0);
// True while the sequence viewer's 3D scene is what the user is watching.
// The switcher's look tiles read it: photos of the 3D model belong to that
// scene, and every other view draws the pair in line artwork.
let watching3D = $state(false);

export const propDrawerState = {
  get isOpen() {
    return isOpen;
  },
  set isOpen(value: boolean) {
    isOpen = value;
  },
  /** True while an app shell mounts the switcher sheet. */
  get available() {
    return hosts > 0;
  },
  get watching3D() {
    return watching3D;
  },
  set watching3D(value: boolean) {
    watching3D = value;
  },
  /** Called by the shell that mounts the sheet; returns the release. */
  registerHost(): () => void {
    hosts += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      hosts -= 1;
    };
  },
  open() {
    isOpen = true;
  },
  close() {
    isOpen = false;
  },
  toggle() {
    isOpen = !isOpen;
  },
};
