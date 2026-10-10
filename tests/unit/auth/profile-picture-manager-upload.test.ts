import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  getStorageInstance: vi.fn(),
  prepareProfilePhoto: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  reportErrorTelemetry: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getStorageInstance: mocks.getStorageInstance,
}));

vi.mock("#lib/shared/auth/services/profile-photo-image.js", () => ({
  prepareProfilePhoto: mocks.prepareProfilePhoto,
}));

vi.mock("firebase/storage", () => ({
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
  getDownloadURL: mocks.getDownloadURL,
  deleteObject: mocks.deleteObject,
}));

vi.mock(
  "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js",
  () => ({ PROP_TYPE_DISPLAY_REGISTRY: {} })
);

vi.mock("#lib/shared/error/services/error-telemetry-reporter.js", () => ({
  reportErrorTelemetry: mocks.reportErrorTelemetry,
}));

import {
  deletePreviousStoredProfilePhoto,
  uploadProfilePhoto,
} from "#lib/shared/auth/services/profile-picture-manager.js";

const user = { uid: "user-1" } as User;

describe("profile picture manager uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1234);
    mocks.getStorageInstance.mockResolvedValue({ bucket: "avatars" });
    mocks.prepareProfilePhoto.mockResolvedValue({
      blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
      width: 512,
      height: 384,
      contentType: "image/webp",
      fileExtension: "webp",
    });
    mocks.ref.mockImplementation((_storage, path: string) => ({
      fullPath: path.includes("old.webp") ? "avatars/user-1/old.webp" : path,
    }));
    mocks.uploadBytes.mockResolvedValue({});
    mocks.getDownloadURL.mockResolvedValue("https://storage/new.webp");
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it("uploads only the normalized WebP with metadata that matches the rules", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "private-name.jpeg", {
      type: "image/jpeg",
    });

    const url = await uploadProfilePhoto(user, file);

    expect(url).toBe("https://storage/new.webp");
    expect(mocks.ref).toHaveBeenCalledWith(
      { bucket: "avatars" },
      "avatars/user-1/1234.webp"
    );
    expect(mocks.uploadBytes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "image/webp" }),
      expect.objectContaining({
        contentType: "image/webp",
        cacheControl: "public,max-age=31536000,immutable",
        customMetadata: expect.objectContaining({
          sourceContentType: "image/jpeg",
          sourceBytes: "3",
          width: "512",
          height: "384",
        }),
      })
    );
    expect(
      mocks.uploadBytes.mock.calls[0]?.[2]?.customMetadata
    ).not.toHaveProperty("originalName");
  });

  it("uploads Safari's PNG fallback with a matching path and content type", async () => {
    const png = new Blob([new Uint8Array([1])], { type: "image/png" });
    mocks.prepareProfilePhoto.mockResolvedValue({
      blob: png,
      width: 448,
      height: 336,
      contentType: "image/png",
      fileExtension: "png",
    });
    const file = new File([new Uint8Array([1, 2, 3])], "camera.heic", {
      type: "image/heic",
    });

    await uploadProfilePhoto(user, file);

    expect(mocks.ref).toHaveBeenCalledWith(
      { bucket: "avatars" },
      "avatars/user-1/1234.png"
    );
    expect(mocks.uploadBytes).toHaveBeenCalledWith(
      expect.anything(),
      png,
      expect.objectContaining({ contentType: "image/png" })
    );
  });

  it("deletes only a replaced avatar owned by the same user", async () => {
    await deletePreviousStoredProfilePhoto(
      "user-1",
      "https://firebasestorage.googleapis.com/old.webp",
      "https://firebasestorage.googleapis.com/new.webp"
    );

    expect(mocks.deleteObject).toHaveBeenCalledWith({
      fullPath: "avatars/user-1/old.webp",
    });

    vi.clearAllMocks();
    await deletePreviousStoredProfilePhoto(
      "user-1",
      "https://images.example.com/old.webp",
      "https://firebasestorage.googleapis.com/new.webp"
    );
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
