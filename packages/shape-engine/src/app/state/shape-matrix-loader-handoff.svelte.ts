/**
 * Whether a pane's loading drawing has handed over to the real content. A pane
 * whose matrix is already built when it opens never shows the drawing; one
 * still building waits for the drawing's closing stroke.
 *
 * Lives here because the panes name their app context `state`, which turns
 * `$state` in their own scripts into a store read.
 */
export function createLoaderHandoff(builtAlready: boolean) {
  let done = $state(builtAlready);
  return {
    get done() {
      return done;
    },
    finish() {
      done = true;
    },
  };
}
