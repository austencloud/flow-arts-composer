// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
} from "../domain/models/favorite-config";
import {
  clearSetupsMirror,
  readCommunitySetupsMirror,
  readPersonalSetupsMirror,
  writeCommunitySetupsMirror,
  writePersonalSetupsMirror,
} from "./setups-cache-mirror";

const CONFIG = {
  level: 2,
  length: 8,
  mode: "freeform",
} as unknown as SavedGeneratorSetup["config"];

function saved(id: string): SavedGeneratorSetup {
  return {
    id,
    name: `Setup ${id}`,
    config: CONFIG,
    startEndOptions: null,
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    updatedAt: new Date("2026-11-02T10:00:00.000Z"),
  };
}

function community(userId: string, setupId: string): CommunitySetup {
  return {
    setupId,
    userId,
    displayName: `User ${userId}`,
    name: setupId,
    config: CONFIG,
    startEndOptions: null,
    createdAt: new Date("2026-11-03T10:00:00.000Z"),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("setups cache mirror", () => {
  it("round-trips saved setups with real Dates, per account", () => {
    writePersonalSetupsMirror("u1", [saved("a")]);

    const back = readPersonalSetupsMirror("u1");
    expect(back).toEqual([saved("a")]);
    expect(back?.[0]?.createdAt).toBeInstanceOf(Date);
    expect(readPersonalSetupsMirror("u2")).toBeNull();
  });

  it("an empty saved list is a real answer, not a miss", () => {
    writePersonalSetupsMirror("u1", []);
    expect(readPersonalSetupsMirror("u1")).toEqual([]);
  });

  it("keeps when the community copy was written", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    writeCommunitySetupsMirror([community("u2", "x")]);

    const back = readCommunitySetupsMirror();
    expect(back?.savedAt).toBe(1_800_000_000_000);
    expect(back?.setups).toEqual([community("u2", "x")]);
  });

  it("discards a copy with a bad date or a missing field", () => {
    localStorage.setItem(
      "tka:setups-mirror:own:u1",
      JSON.stringify({
        v: 1,
        savedAt: 1,
        data: [{ ...saved("a"), createdAt: "garbage" }],
      })
    );
    expect(readPersonalSetupsMirror("u1")).toBeNull();

    localStorage.setItem(
      "tka:setups-mirror:community",
      JSON.stringify({ v: 1, savedAt: 1, data: [{ name: "no ids" }] })
    );
    expect(readCommunitySetupsMirror()).toBeNull();
  });

  it("ignores a copy written in another schema version", () => {
    localStorage.setItem(
      "tka:setups-mirror:own:u1",
      JSON.stringify({ v: 999, savedAt: 1, data: [] })
    );
    expect(readPersonalSetupsMirror("u1")).toBeNull();
  });

  it("sign-out drops the account's saved setups but keeps the public community copy", () => {
    writePersonalSetupsMirror("u1", [saved("a")]);
    writeCommunitySetupsMirror([community("u2", "x")]);

    clearSetupsMirror("u1");

    expect(readPersonalSetupsMirror("u1")).toBeNull();
    expect(readCommunitySetupsMirror()?.setups).toHaveLength(1);
  });

  it("a full quota stays silent", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => writePersonalSetupsMirror("u1", [saved("a")])).not.toThrow();
    expect(readPersonalSetupsMirror("u1")).toBeNull();
  });
});
