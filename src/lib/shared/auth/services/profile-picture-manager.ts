/**
 * OAuth provider profile picture management for Firebase Auth users.
 * Manages Facebook and Google profile pictures with proper fallback logic.
 * Also generates custom avatars with gradient backgrounds and prop silhouettes.
 */

import { updateProfile, type User } from "firebase/auth";
import type { GeneratedAvatarData } from "./types";
import { getStorageInstance } from "#lib/shared/auth/firebase.js";
import { PROP_TYPE_DISPLAY_REGISTRY } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import { prepareProfilePhoto } from "./profile-photo-image";

/**
 * Update Facebook profile picture to high resolution if needed.
 * Skipped if user has Google account linked (Google photos are more reliable).
 */
export async function updateFacebookProfilePictureIfNeeded(
  user: User
): Promise<void> {
  try {
    const facebookData = user.providerData.find(
      (data) => data.providerId === "facebook.com"
    );
    if (!facebookData?.uid) return;

    if (user.photoURL?.includes("firebasestorage.googleapis.com")) return;

    const hasGoogle = user.providerData.some(
      (data) => data.providerId === "google.com"
    );
    if (hasGoogle) return;

    if (user.photoURL?.includes("graph.facebook.com")) return;
    if (user.photoURL?.includes("googleusercontent.com")) return;

    const photoURL = `https://graph.facebook.com/${facebookData.uid}/picture?type=large`;
    await updateProfile(user, { photoURL });
  } catch (err) {
    console.error(
      `[profile-picture-manager] Failed to update Facebook profile picture:`,
      err
    );
  }
}

/**
 * Update Google profile picture if needed.
 * Google photos are preferred over Facebook (no access tokens, more reliable).
 */
export async function updateGoogleProfilePictureIfNeeded(
  user: User
): Promise<void> {
  try {
    const googleData = user.providerData.find(
      (data) => data.providerId === "google.com"
    );
    if (!googleData?.uid) return;

    const isCustomAvatar = user.photoURL?.includes(
      "firebasestorage.googleapis.com"
    );
    if (isCustomAvatar) return;

    if (googleData.photoURL) {
      const isCurrentlyGoogle = user.photoURL?.includes(
        "googleusercontent.com"
      );
      const isSameAsProvider = user.photoURL === googleData.photoURL;

      if (!user.photoURL || !isCurrentlyGoogle || !isSameAsProvider) {
        await updateProfile(user, { photoURL: googleData.photoURL });
      }
    }
  } catch (err) {
    console.error(
      `[profile-picture-manager] Failed to update Google profile picture:`,
      err
    );
  }
}

/** Get provider-specific IDs for storing in user document. */
export function getProviderIds(user: User): {
  googleId?: string;
  facebookId?: string;
} {
  const result: { googleId?: string; facebookId?: string } = {};

  for (const provider of user.providerData) {
    if (provider.providerId === "google.com" && provider.uid) {
      result.googleId = provider.uid;
    } else if (provider.providerId === "facebook.com" && provider.uid) {
      result.facebookId = provider.uid;
    }
  }

  return result;
}

/** Normalize a device photo before it reaches the public avatar bucket. */
export async function uploadProfilePhoto(
  user: User,
  file: File
): Promise<string> {
  const prepared = await prepareProfilePhoto(file);
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const storage = await getStorageInstance();
  const storageRef = ref(
    storage,
    `avatars/${user.uid}/${Date.now()}.${prepared.fileExtension}`
  );

  await uploadBytes(storageRef, prepared.blob, {
    contentType: prepared.contentType,
    cacheControl: "public,max-age=31536000,immutable",
    customMetadata: {
      userId: user.uid,
      sourceContentType: file.type,
      sourceBytes: String(file.size),
      width: String(prepared.width),
      height: String(prepared.height),
      uploadedAt: new Date().toISOString(),
    },
  });

  return getDownloadURL(storageRef);
}

/** Remove the superseded Storage object after the new profile is durable. */
export async function deletePreviousStoredProfilePhoto(
  userId: string,
  previousPhotoURL: string | null,
  currentPhotoURL: string
): Promise<void> {
  if (!previousPhotoURL || previousPhotoURL === currentPhotoURL) return;
  if (
    !previousPhotoURL.startsWith("gs://") &&
    !previousPhotoURL.includes("firebasestorage.googleapis.com")
  ) {
    return;
  }

  try {
    const { ref, deleteObject } = await import("firebase/storage");
    const storage = await getStorageInstance();
    const previousRef = ref(storage, previousPhotoURL);
    if (!previousRef.fullPath.startsWith(`avatars/${userId}/`)) return;
    await deleteObject(previousRef);
  } catch (error) {
    if (
      (error as { code?: string } | null)?.code === "storage/object-not-found"
    ) {
      return;
    }

    const reportedError =
      error instanceof Error ? error : new Error(String(error));
    const { reportErrorTelemetry } =
      await import("#lib/shared/error/services/error-telemetry-reporter.js");
    await reportErrorTelemetry({
      message: "Old profile photo could not be removed",
      technicalDetails: reportedError.message,
      error: reportedError,
      severity: "warning",
      context: {
        module: "settings",
        tab: "profile",
        action: "delete-previous-profile-photo",
      },
    });
  }
}

async function drawGradient(
  ctx: CanvasRenderingContext2D,
  cssGradient: string,
  size: number
): Promise<void> {
  const match = cssGradient.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);

  if (!match) {
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(0, 0, size, size);
    return;
  }

  const angle = parseInt(match[1] ?? "135", 10);
  const colorStops = match[2] ?? "";

  const angleRad = ((angle - 90) * Math.PI) / 180;
  const x1 = size / 2 - (Math.cos(angleRad) * size) / 2;
  const y1 = size / 2 - (Math.sin(angleRad) * size) / 2;
  const x2 = size / 2 + (Math.cos(angleRad) * size) / 2;
  const y2 = size / 2 + (Math.sin(angleRad) * size) / 2;

  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

  const stopRegex = /(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)?%?/g;
  let stopMatch;
  const stops: Array<{ color: string; position: number }> = [];

  while ((stopMatch = stopRegex.exec(colorStops)) !== null) {
    const color = stopMatch[1] ?? "#ffffff";
    const position = stopMatch[2] ? parseInt(stopMatch[2], 10) / 100 : null;
    stops.push({ color, position: position ?? 0 });
  }

  stops.forEach((stop, i) => {
    if (stop.position === 0 && i > 0) {
      stop.position = i / (stops.length - 1);
    }
  });

  stops.forEach((stop) => {
    try {
      gradient.addColorStop(stop.position, stop.color);
    } catch {
      // Invalid color, skip
    }
  });

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}

async function drawPropSilhouette(
  ctx: CanvasRenderingContext2D,
  imageSrc: string,
  size: number
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const maxPropSize = size * 0.55;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      let propWidth: number;
      let propHeight: number;

      if (imgAspect > 1) {
        propWidth = maxPropSize;
        propHeight = maxPropSize / imgAspect;
      } else {
        propHeight = maxPropSize;
        propWidth = maxPropSize * imgAspect;
      }

      const x = (size - propWidth) / 2;
      const y = (size - propHeight) / 2;

      const offscreen = document.createElement("canvas");
      offscreen.width = propWidth;
      offscreen.height = propHeight;
      const offCtx = offscreen.getContext("2d");

      if (offCtx) {
        offCtx.drawImage(img, 0, 0, propWidth, propHeight);
        offCtx.globalCompositeOperation = "source-in";
        offCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
        offCtx.fillRect(0, 0, propWidth, propHeight);
        ctx.drawImage(offscreen, x, y);
      }

      resolve();
    };

    img.onerror = (e) => {
      console.error("Failed to load prop image:", imageSrc, e);
      resolve();
    };

    img.src = imageSrc;
  });
}

/** Generate a custom avatar image and upload to Firebase Storage. */
export async function generateAndUploadAvatar(
  user: User,
  avatarData: GeneratedAvatarData
): Promise<string> {
  const { gradient, propType, gradientId } = avatarData;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Failed to create canvas context");

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  await drawGradient(ctx, gradient, size);

  const propInfo = PROP_TYPE_DISPLAY_REGISTRY[propType];
  if (propInfo?.image) {
    await drawPropSilhouette(ctx, propInfo.image, size);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create blob"));
      },
      "image/png",
      0.95
    );
  });

  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const storage = await getStorageInstance();

  const storagePath = `avatars/${user.uid}/${gradientId}_${propType}.png`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob, {
    contentType: "image/png",
    customMetadata: {
      userId: user.uid,
      gradientId,
      propType,
      generatedAt: new Date().toISOString(),
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}
