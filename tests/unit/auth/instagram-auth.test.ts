import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  signInWithCustomToken: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  configureAuthPersistence: vi.fn(),
  getAuthInstance: vi.fn(),
  getFirestoreInstance: vi.fn(),
  getFunctionsInstance: vi.fn(),
}));

import {
  getInstagramAuthErrorCode,
  getInstagramAuthErrorMessage,
  readInstagramOAuthState,
} from "#lib/shared/auth/services/instagram-auth.js";
import { INSTAGRAM_LOGIN_ENABLED } from "#lib/shared/auth/services/auth-providers.config.js";

describe("Instagram client auth contract", () => {
  it("keeps the entry point off until the external provider test passes", () => {
    expect(INSTAGRAM_LOGIN_ENABLED).toBe(false);
  });

  it("reads completion and safe errors from the Firestore state document", () => {
    expect(readInstagramOAuthState({ status: "processing" })).toEqual({
      status: "waiting",
    });
    expect(readInstagramOAuthState({ status: "complete" })).toEqual({
      status: "complete",
    });
    expect(
      readInstagramOAuthState({
        status: "error",
        errorCode: "instagram/account-type-required",
      })
    ).toEqual({
      status: "error",
      errorCode: "instagram/account-type-required",
    });
  });

  it("uses callable details instead of exposing Firebase's wrapper code", () => {
    const error = {
      code: "functions/failed-precondition",
      details: { reason: "instagram/only-method" },
    };
    expect(getInstagramAuthErrorCode(error)).toBe("instagram/only-method");
    expect(getInstagramAuthErrorMessage(error)).toBe(
      "Add another sign-in method before disconnecting Instagram."
    );
  });

  it("keeps user cancellation silent", () => {
    expect(
      getInstagramAuthErrorMessage({
        details: { reason: "instagram/cancelled" },
      })
    ).toBeNull();
  });
});
