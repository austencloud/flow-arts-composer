/**
 * Readiness of the method a front-door tap is entering.
 *
 * The panel slot reports when the method's panel has mounted; the module root
 * reports when its pictures have drawn. The front door stays on screen until
 * both are true (see create-method-entry-gate.ts). A report for another
 * method than the one being entered is ignored, so a late panel from an
 * earlier tap cannot release a new entry early.
 *
 * `arriving` stays true from the tap until the crossfade has finished, so work
 * a panel would normally do in the page's first idle moment (building a hidden
 * overlay, say) can wait for the fade instead of stalling it.
 */
export function createMethodEntryState() {
  let method = $state<string | null>(null);
  let panelReady = $state(false);
  let piecesReady = $state(false);
  let picturesReady = $state(false);
  let arriving = $state(false);

  return {
    get method() {
      return method;
    },
    get panelReady() {
      return panelReady;
    },
    /** The workspace's pieces are laid out, pictures drawn or not. */
    get piecesReady() {
      return piecesReady;
    },
    get picturesReady() {
      return picturesReady;
    },
    get arriving() {
      return arriving;
    },
    begin(next: string) {
      method = next;
      panelReady = false;
      piecesReady = false;
      picturesReady = false;
      arriving = true;
    },
    /** The fade onto the workspace finished, or the entry was abandoned. */
    finish() {
      arriving = false;
    },
    markPanelReady(of: string) {
      if (of === method) panelReady = true;
    },
    markPiecesReady(of: string) {
      if (of === method && panelReady) piecesReady = true;
    },
    markPicturesReady(of: string) {
      if (of === method && panelReady) {
        piecesReady = true;
        picturesReady = true;
      }
    },
  };
}

export type MethodEntryState = ReturnType<typeof createMethodEntryState>;
