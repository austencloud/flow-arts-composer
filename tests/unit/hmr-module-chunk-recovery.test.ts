import { beforeEach, describe, expect, it } from "vitest";

import {
  claimModuleChunkRecovery,
  clearModuleChunkRecoveryGuard,
} from "#lib/shared/hmr-helper.js";

describe("module chunk recovery guard", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does not let a background preload re-arm a failed active module", () => {
    expect(claimModuleChunkRecovery("settings")).toBe(true);

    clearModuleChunkRecoveryGuard("museum");

    expect(claimModuleChunkRecovery("settings")).toBe(false);
  });

  it("re-arms recovery after the failed active module loads cleanly", () => {
    expect(claimModuleChunkRecovery("settings")).toBe(true);

    clearModuleChunkRecoveryGuard("settings");

    expect(claimModuleChunkRecovery("settings")).toBe(true);
  });

  it("honors the guard written by the previous app version", () => {
    sessionStorage.setItem("tka-module-chunk-reload", "1");

    clearModuleChunkRecoveryGuard("museum");
    expect(claimModuleChunkRecovery("settings")).toBe(false);

    clearModuleChunkRecoveryGuard("settings");
    expect(claimModuleChunkRecovery("settings")).toBe(true);
  });
});
