import { describe, expect, it, vi } from "vitest";
import {
  PROFILE_PHOTO_INPUT_MAX_BYTES,
  PROFILE_PHOTO_MAX_UPLOAD_BYTES,
  ProfilePhotoError,
  assertProfilePhotoInput,
  fitProfilePhotoDimensions,
  getProfilePhotoErrorMessage,
  prepareProfilePhoto,
  type ProfilePhotoImageDependencies,
} from "#lib/shared/auth/services/profile-photo-image.js";

function imageFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "camera.jpeg", {
    type: "image/jpeg",
  });
}

function createHarness(blobs: Blob[]) {
  const drawImage = vi.fn();
  const close = vi.fn();
  const qualities: number[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toBlob: vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      qualities.push(quality ?? 0);
      callback(blobs.shift() ?? null);
    }),
  };
  const dependencies = {
    decode: vi.fn(async () => ({
      source: {} as CanvasImageSource,
      width: 4032,
      height: 3024,
      close,
    })),
    createCanvas: vi.fn(() => canvas),
  } as unknown as ProfilePhotoImageDependencies;

  return { dependencies, canvas, drawImage, close, qualities };
}

describe("profile photo image preparation", () => {
  it("keeps the camera aspect ratio while bounding the longest edge", () => {
    expect(fitProfilePhotoDimensions(4032, 3024)).toEqual({
      width: 512,
      height: 384,
    });
    expect(fitProfilePhotoDimensions(240, 320)).toEqual({
      width: 240,
      height: 320,
    });
  });

  it("encodes a device photo as a bounded WebP upload", async () => {
    const output = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/webp",
    });
    const harness = createHarness([output]);

    const prepared = await prepareProfilePhoto(
      imageFile(),
      harness.dependencies
    );

    expect(prepared).toEqual({
      blob: output,
      width: 512,
      height: 384,
      contentType: "image/webp",
      fileExtension: "webp",
    });
    expect(harness.canvas).toMatchObject({ width: 512, height: 384 });
    expect(harness.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      512,
      384
    );
    expect(harness.qualities).toEqual([0.86]);
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("reduces WebP quality until the Storage rule size is satisfied", async () => {
    const oversized = new Blob(
      [new Uint8Array(PROFILE_PHOTO_MAX_UPLOAD_BYTES)],
      { type: "image/webp" }
    );
    const accepted = new Blob([new Uint8Array([1])], {
      type: "image/webp",
    });
    const harness = createHarness([oversized, accepted]);

    const prepared = await prepareProfilePhoto(
      imageFile(),
      harness.dependencies
    );

    expect(prepared.blob).toBe(accepted);
    expect(harness.qualities).toEqual([0.86, 0.76]);
  });

  it("accepts Safari's PNG fallback with matching upload metadata", async () => {
    const fallbackPng = new Blob([new Uint8Array([1])], {
      type: "image/png",
    });
    const harness = createHarness([fallbackPng]);

    await expect(
      prepareProfilePhoto(imageFile(), harness.dependencies)
    ).resolves.toMatchObject({
      blob: fallbackPng,
      contentType: "image/png",
      fileExtension: "png",
      width: 512,
      height: 384,
    });
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("downscales an oversized PNG fallback until Storage will accept it", async () => {
    const oversizedPng = new Blob(
      [new Uint8Array(PROFILE_PHOTO_MAX_UPLOAD_BYTES)],
      { type: "image/png" }
    );
    const acceptedPng = new Blob([new Uint8Array([1])], {
      type: "image/png",
    });
    const harness = createHarness([oversizedPng, acceptedPng]);

    const prepared = await prepareProfilePhoto(
      imageFile(),
      harness.dependencies
    );

    expect(prepared).toMatchObject({
      blob: acceptedPng,
      contentType: "image/png",
      fileExtension: "png",
      width: 448,
      height: 336,
    });
    expect(harness.drawImage).toHaveBeenLastCalledWith(
      expect.anything(),
      0,
      0,
      448,
      336
    );
  });

  it("rejects a fallback format that Storage will not accept", async () => {
    const unsupported = new Blob([new Uint8Array([1])], {
      type: "image/jpeg",
    });
    const harness = createHarness([unsupported]);

    await expect(
      prepareProfilePhoto(imageFile(), harness.dependencies)
    ).rejects.toMatchObject<Partial<ProfilePhotoError>>({
      code: "encode-unsupported",
    });
  });

  it("uses the same 5 MB input boundary as the picker", () => {
    const tooLarge = {
      size: PROFILE_PHOTO_INPUT_MAX_BYTES + 1,
      type: "image/jpeg",
    } as File;

    expect(() => assertProfilePhotoInput(tooLarge)).toThrowError(
      "Choose an image smaller than 5 MB."
    );
  });

  it("turns Firebase failures into retryable user copy", () => {
    expect(getProfilePhotoErrorMessage({ code: "storage/unauthorized" })).toBe(
      "Photo uploads are unavailable right now. Try again later."
    );
    expect(
      getProfilePhotoErrorMessage({ code: "storage/retry-limit-exceeded" })
    ).toBe("The upload was interrupted. Check your connection and try again.");
  });
});
