import type { PreparedPreviewVideo } from "@austencloud/video-editor/core";
import {
  PreviewVideoCache,
  PreviewVideoLocalStore,
  findEditCopy,
  renderPreviewVideo,
  type IPreviewVideoCache,
} from "@austencloud/video-editor/render";
import { isFeatureVideoMediaUrl } from "./domain/feature-video";

let instance: IPreviewVideoCache | null = null;

/**
 * The editing copy beside a take's video, if one was prepared. A feature
 * video's media folder holds no editing copies, so its takes skip the two
 * requests.
 */
export function findPreparedPreview(
  sourceUrl: string,
  signal: AbortSignal
): Promise<PreparedPreviewVideo | null> {
  return isFeatureVideoMediaUrl(sourceUrl)
    ? Promise.resolve(null)
    : findEditCopy(sourceUrl, signal);
}

export function getPreviewVideoCache(): IPreviewVideoCache {
  instance ??= new PreviewVideoCache({
    store: new PreviewVideoLocalStore(),
    render: renderPreviewVideo,
    supported: () =>
      typeof Worker !== "undefined" && typeof VideoEncoder !== "undefined",
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    findPrepared: findPreparedPreview,
  });
  return instance;
}
