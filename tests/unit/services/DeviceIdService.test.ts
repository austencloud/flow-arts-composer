import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock Firebase BEFORE importing DeviceIdService
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getFirestore: vi.fn(() => ({ type: "firestore" })),
  serverTimestamp: vi.fn(() => ({ _type: "timestamp" })),
}));

import { getDeviceId } from "#lib/shared/auth/services/device-id-service.js";

describe("device-id-service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("generates a UUID on first call and persists it", () => {
    const id1 = getDeviceId();
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem("tka:deviceId")).toBe(id1);
  });

  it("returns the same id on subsequent calls in the same session", () => {
    const id1 = getDeviceId();
    const id2 = getDeviceId();
    expect(id1).toBe(id2);
  });

  it("returns the persisted id when called after a prior session", () => {
    localStorage.setItem("tka:deviceId", "00000000-0000-4000-8000-000000000001");
    expect(getDeviceId()).toBe("00000000-0000-4000-8000-000000000001");
  });
});
