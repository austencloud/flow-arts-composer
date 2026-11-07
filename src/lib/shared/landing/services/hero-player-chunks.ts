/**
 * The chunks a hero stage loads, in one place so a page's own player and the
 * resident player cannot drift apart.
 *
 * The LOOP badge's resolver is registered before the player mounts, not after:
 * the canvas reads it once per sequence (it is a plain variable, not reactive),
 * and the public landing never loads the app's composition root that normally
 * registers it. Without this the hero never shows a LOOP badge.
 */
export function loadHeroPlayer() {
  return Promise.all([
    import("#lib/shared/composition-root/register-loop-display.js"),
    import("#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"),
  ]).then(([loopDisplay, player]) => {
    loopDisplay.registerLoopDisplay();
    return player;
  });
}

export function loadHeroNotationRail() {
  return import("#lib/shared/timeline/StepStrip.svelte");
}
