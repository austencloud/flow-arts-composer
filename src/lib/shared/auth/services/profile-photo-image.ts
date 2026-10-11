import { t } from "#lib/shared/i18n/i18n.svelte.js";

const WEBP_CONTENT_TYPE = "image/webp";
const PNG_CONTENT_TYPE = "image/png";

export const PROFILE_PHOTO_INPUT_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_UPLOAD_BYTES = 1024 * 1024;
export const PROFILE_PHOTO_MAX_DIMENSION = 512;

const WEBP_QUALITIES = [0.86, 0.76, 0.66] as const;
// PNG has no lossy quality control, so Safari's fallback is bounded by pixels.
const PNG_FALLBACK_DIMENSIONS = [448, 384, 320, 256, 192, 128] as const;

export type ProfilePhotoContentType =
  | typeof WEBP_CONTENT_TYPE
  | typeof PNG_CONTENT_TYPE;

export type ProfilePhotoErrorCode =
  | "signed-out"
  | "input-too-large"
  | "input-not-image"
  | "decode-failed"
  | "encode-unsupported"
  | "output-too-large";

export class ProfilePhotoError extends Error {
  constructor(
    readonly code: ProfilePhotoErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ProfilePhotoError";
  }
}

interface DecodedProfilePhoto {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

interface ProfilePhotoCanvas {
  width: number;
  height: number;
  getContext: (contextId: "2d") => CanvasRenderingContext2D | null;
  toBlob: (callback: BlobCallback, type?: string, quality?: number) => void;
}

export interface ProfilePhotoImageDependencies {
  decode: (file: File) => Promise<DecodedProfilePhoto>;
  createCanvas: () => ProfilePhotoCanvas;
}

export interface PreparedProfilePhoto {
  blob: Blob;
  width: number;
  height: number;
  contentType: ProfilePhotoContentType;
  fileExtension: "webp" | "png";
}

export function assertProfilePhotoInput(file: File): void {
  if (file.size > PROFILE_PHOTO_INPUT_MAX_BYTES) {
    throw new ProfilePhotoError(
      "input-too-large",
      "Choose an image smaller than 5 MB."
    );
  }

  if (!file.type.startsWith("image/")) {
    throw new ProfilePhotoError("input-not-image", "Choose an image file.");
  }
}

export function fitProfilePhotoDimensions(
  width: number,
  height: number,
  maxDimension = PROFILE_PHOTO_MAX_DIMENSION
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ProfilePhotoError(
      "decode-failed",
      "That photo could not be read. Try a JPEG, PNG, HEIC, or WebP image."
    );
  }

  const scale = Math.min(1, maxDimension / width, maxDimension / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeWithImageElement(
  file: File
): Promise<DecodedProfilePhoto> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Browser image decoding failed"));
      image.src = objectUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function decodeInBrowser(file: File): Promise<DecodedProfilePhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some camera formats through Image even when
      // createImageBitmap rejects them, so give its native decoder a turn.
    }
  }

  return decodeWithImageElement(file);
}

function createBrowserCanvas(): ProfilePhotoCanvas {
  return document.createElement("canvas");
}

function encodeCanvas(
  canvas: ProfilePhotoCanvas,
  contentType: ProfilePhotoContentType,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Browser image encoding failed"));
        }
      },
      contentType,
      quality
    );
  });
}

function drawProfilePhoto(
  canvas: ProfilePhotoCanvas,
  context: CanvasRenderingContext2D,
  decoded: DecodedProfilePhoto,
  maxDimension: number
): { width: number; height: number } {
  const dimensions = fitProfilePhotoDimensions(
    decoded.width,
    decoded.height,
    maxDimension
  );
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
  return dimensions;
}

function preparedPhoto(
  blob: Blob,
  dimensions: { width: number; height: number },
  contentType: ProfilePhotoContentType
): PreparedProfilePhoto {
  return {
    blob,
    ...dimensions,
    contentType,
    fileExtension: contentType === WEBP_CONTENT_TYPE ? "webp" : "png",
  };
}

async function encodePngFallback(
  canvas: ProfilePhotoCanvas,
  context: CanvasRenderingContext2D,
  decoded: DecodedProfilePhoto,
  dimensions: { width: number; height: number },
  browserFallback?: Blob
): Promise<PreparedProfilePhoto> {
  let blob = browserFallback;
  if (!blob || blob.type !== PNG_CONTENT_TYPE) {
    blob = await encodeCanvas(canvas, PNG_CONTENT_TYPE);
  }

  if (blob.type !== PNG_CONTENT_TYPE) {
    throw new Error(`Browser returned unsupported image type: ${blob.type}`);
  }

  if (blob.size < PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
    return preparedPhoto(blob, dimensions, PNG_CONTENT_TYPE);
  }

  for (const maxDimension of PNG_FALLBACK_DIMENSIONS) {
    const nextDimensions = fitProfilePhotoDimensions(
      decoded.width,
      decoded.height,
      maxDimension
    );
    if (
      nextDimensions.width === dimensions.width &&
      nextDimensions.height === dimensions.height
    ) {
      continue;
    }

    dimensions = drawProfilePhoto(canvas, context, decoded, maxDimension);
    blob = await encodeCanvas(canvas, PNG_CONTENT_TYPE);
    if (blob.type !== PNG_CONTENT_TYPE) {
      throw new Error(`Browser returned unsupported image type: ${blob.type}`);
    }
    if (blob.size < PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
      return preparedPhoto(blob, dimensions, PNG_CONTENT_TYPE);
    }
  }

  throw new ProfilePhotoError(
    "output-too-large",
    "That photo is too detailed to upload. Try a different image."
  );
}

export async function prepareProfilePhoto(
  file: File,
  dependencies: ProfilePhotoImageDependencies = {
    decode: decodeInBrowser,
    createCanvas: createBrowserCanvas,
  }
): Promise<PreparedProfilePhoto> {
  assertProfilePhotoInput(file);

  let decoded: DecodedProfilePhoto;
  try {
    decoded = await dependencies.decode(file);
  } catch (error) {
    throw new ProfilePhotoError(
      "decode-failed",
      "That photo could not be read. Try a JPEG, PNG, HEIC, or WebP image.",
      { cause: error }
    );
  }

  try {
    const canvas = dependencies.createCanvas();
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ProfilePhotoError(
        "encode-unsupported",
        "This browser could not prepare the photo. Try a JPEG, PNG, or WebP image."
      );
    }

    const dimensions = drawProfilePhoto(
      canvas,
      context,
      decoded,
      PROFILE_PHOTO_MAX_DIMENSION
    );

    try {
      for (const quality of WEBP_QUALITIES) {
        let blob: Blob;
        try {
          blob = await encodeCanvas(canvas, WEBP_CONTENT_TYPE, quality);
        } catch {
          return await encodePngFallback(canvas, context, decoded, dimensions);
        }

        // Safari stable returns PNG when asked for WebP. That is an expected
        // capability fallback, and avatars/{uid} already permits either type.
        if (blob.type === PNG_CONTENT_TYPE) {
          return await encodePngFallback(
            canvas,
            context,
            decoded,
            dimensions,
            blob
          );
        }

        if (blob.type !== WEBP_CONTENT_TYPE) {
          throw new ProfilePhotoError(
            "encode-unsupported",
            "This browser could not prepare the photo. Try a JPEG, PNG, or WebP image."
          );
        }

        if (blob.size < PROFILE_PHOTO_MAX_UPLOAD_BYTES) {
          return preparedPhoto(blob, dimensions, WEBP_CONTENT_TYPE);
        }
      }

      throw new ProfilePhotoError(
        "output-too-large",
        "That photo is too detailed to upload. Try a different image."
      );
    } catch (error) {
      if (error instanceof ProfilePhotoError) throw error;
      throw new ProfilePhotoError(
        "encode-unsupported",
        "This browser could not prepare the photo. Try a JPEG, PNG, or WebP image.",
        { cause: error }
      );
    }
  } finally {
    decoded.close?.();
  }
}

export function getProfilePhotoErrorMessage(error: unknown): string {
  if (error instanceof ProfilePhotoError) {
    switch (error.code) {
      case "signed-out":
        return t("settings_photo_sign_in_again");
      case "input-too-large":
        return t("settings_photo_input_too_large");
      case "input-not-image":
        return t("settings_photo_input_not_image");
      case "decode-failed":
        return t("settings_photo_decode_failed");
      case "encode-unsupported":
        return t("settings_photo_encode_unsupported");
      case "output-too-large":
        return t("settings_photo_output_too_large");
    }
  }

  const code = (error as { code?: unknown } | null)?.code;
  if (code === "storage/unauthenticated") {
    return t("settings_photo_sign_in_again");
  }
  if (code === "storage/unauthorized") {
    return t("settings_photo_upload_unavailable");
  }
  if (
    code === "storage/retry-limit-exceeded" ||
    code === "storage/unknown" ||
    code === "unavailable"
  ) {
    return t("settings_photo_upload_interrupted");
  }

  return t("settings_photo_update_failed");
}
