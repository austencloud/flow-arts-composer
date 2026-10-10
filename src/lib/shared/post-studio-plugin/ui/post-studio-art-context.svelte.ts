import { getContext, setContext } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { MandalaViewerController } from "$lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte";
import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";

/**
 * The tunnel and mandala controllers, owned ONCE per studio.
 *
 * This is the same ownership ArtPane uses in the sequence viewer: one
 * controller instance backs both the thing that renders (the slot's layer) and
 * the thing that steers it (the inspector's ArtSettingsPanel). Constructing a
 * controller inside the layer — which is what the slots did first — puts the
 * canvas somewhere the controls can never reach, so a Look or Spin change would
 * drive an instance nothing is drawing from.
 */
export class PostStudioArtControllers {
  readonly tunnel: TunnelViewController;
  readonly mandala: MandalaViewerController;

  /**
   * How many mounted slots are drawing the kaleidoscope. Both slots may be
   * tunnels, so activation is refcounted rather than a bare boolean — closing
   * one of two tunnels must not stop the layer build for the other.
   */
  #tunnelUsers = 0;

  constructor(sources: {
    getSequence: () => SequenceData;
    getLeftPropType: () => string | undefined;
    getRightPropType: () => string | undefined;
    pathPolicy: AnimationVisibilityStateManager;
  }) {
    this.tunnel = new TunnelViewController({
      getSequence: sources.getSequence,
    });
    this.mandala = new MandalaViewerController({
      getSequence: sources.getSequence,
      getLeftPropType: sources.getLeftPropType,
      getRightPropType: sources.getRightPropType,
      pathPolicy: sources.pathPolicy,
    });
  }

  /** Call from a tunnel slot's setup; the returned function releases it. */
  retainTunnel(): () => void {
    this.#tunnelUsers += 1;
    this.tunnel.active = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#tunnelUsers = Math.max(0, this.#tunnelUsers - 1);
      if (this.#tunnelUsers === 0) this.tunnel.active = false;
    };
  }
}

const POST_STUDIO_ART_CONTEXT = Symbol("post-studio-art");

export function setPostStudioArtContext(
  controllers: PostStudioArtControllers
): void {
  setContext(POST_STUDIO_ART_CONTEXT, controllers);
}

export function getPostStudioArtContext(): PostStudioArtControllers {
  const controllers = getContext<PostStudioArtControllers>(
    POST_STUDIO_ART_CONTEXT
  );
  if (!controllers)
    throw new Error("Post Studio art controllers are not available");
  return controllers;
}
