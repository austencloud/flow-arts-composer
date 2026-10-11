import { CompositeVideoRenderer } from '#lib/shared/animation-engine/services/composite-video-renderer.js';
import { getImageComposer } from '#lib/shared/render/get-image-composer.js';

let instance: CompositeVideoRenderer | null = null;
export function getCompositeVideoRenderer(): CompositeVideoRenderer {
  return instance ??= new CompositeVideoRenderer(
    getImageComposer()
  );
}
