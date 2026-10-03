import { PreviewVideoCache } from "./services/implementations/PreviewVideoCache";
import { PreviewVideoLocalStore } from "./services/preview-video-store";
import { renderPreviewVideo } from "./services/preview-video-render";
import { findEditCopy } from "./services/edit-copy-lookup";
import type { IPreviewVideoCache } from "./services/contracts/IPreviewVideoCache";

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
