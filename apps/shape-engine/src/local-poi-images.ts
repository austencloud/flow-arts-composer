import type { PoiImageLibraryEntry } from "$lib/shared/poi/domain/poi-image-library-entry";

// Account-uploaded POV images belong to Composer's Pattern Lab. Shape Engine
// uses its bundled pattern generators and has no account image collection.
export async function getEntry(_id: string): Promise<PoiImageLibraryEntry | null> {
  return null;
}

export async function loadAsImageData(entry: PoiImageLibraryEntry): Promise<ImageData> {
  const response = await fetch(entry.storageUrl);
  if (!response.ok) throw new Error(`Could not load pattern image (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Pattern image canvas is unavailable");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
