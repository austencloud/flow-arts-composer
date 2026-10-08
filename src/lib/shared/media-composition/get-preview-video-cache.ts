import {
  PreviewVideoCache,
  PreviewVideoLocalStore,
  renderPreviewVideo,
} from "@austencloud/video-editor/render";
import { findEditCopy } from "./services/edit-copy-lookup";
import type { IPreviewVideoCache } from "@austencloud/video-editor/render";

let instance: IPreviewVideoCache | null = null;

export function getPreviewVideoCache(): IPreviewVideoCache {
  instance ??= new PreviewVideoCache({
    store: new PreviewVideoLocalStore(),
    render: renderPreviewVideo,
    supported: () =>
      typeof Worker !== "undefined" && typeof VideoEncoder !== "undefined",
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    findPrepared: (sourceUrl, signal) => findEditCopy(sourceUrl, signal),
  });
  return instance;
}
