// Reactive stand-in for the overlay state, so host tests can open and close.
export const overlayStateStub = $state({
  isOpen: false,
  sequence: null as unknown,
  initialBpm: 60,
  initialStep: 0,
  initialPlaybackMode: "continuous",
  initialViewMode: "animation",
  initialViewerMode: undefined,
  handPathMode: false,
  playOnOpen: false,
  collectionPropType: null,
  analyticsSource: "create_workspace",
  activeShortCode: null,
  shareOnOpen: false,
  saveOnOpen: false,
  tunnelComposition: null,
  sessionKey: 0,
  dismissPath: null,
  openedFromUrl: false,
});

export function closeOverlayStateStub(): void {
  overlayStateStub.isOpen = false;
  overlayStateStub.sequence = null;
}
