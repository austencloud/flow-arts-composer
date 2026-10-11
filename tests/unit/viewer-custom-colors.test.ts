import { afterEach, describe, expect, it, vi } from "vitest";
import { effect_root } from "svelte/internal/client";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import {
  DEFAULT_VIEWER_CUSTOM_COLORS,
  resolveViewerCustomColorPair,
} from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
import {
  STAGED_VIEWER_CUSTOM_COLORS_STORAGE_KEY,
  VIEWER_CUSTOM_COLORS_STORAGE_KEY,
  consumeStagedViewerCustomColors,
  loadViewerCustomColorPreference,
  saveViewerCustomColorPreference,
  stageViewerCustomColors,
} from "#lib/shared/sequence-viewer/services/viewer-custom-color-preferences.js";
import { createViewerCustomColorState } from "#lib/shared/sequence-viewer/state/viewer-custom-colors-state.svelte.js";
import { MandalaViewerController } from "#lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.js";
import { TunnelViewController } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.js";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("viewer custom color preference", () => {
  it("normalizes the canonical pair and round-trips its versioned record", () => {
    const storage = new MemoryStorage();

    saveViewerCustomColorPreference(
      { left: " #0DF ", right: "#FFB000" },
      storage
    );

    expect(loadViewerCustomColorPreference(storage)).toEqual({
      left: "#00ddff",
      right: "#ffb000",
    });
    expect(
      JSON.parse(storage.getItem(VIEWER_CUSTOM_COLORS_STORAGE_KEY)!)
    ).toEqual({
      version: 2,
      colors: { left: "#00ddff", right: "#ffb000" },
    });
  });

  it("migrates the one authored legacy pair instead of the other surface's default", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tka_tunnel_view_state",
      JSON.stringify({
        colors: {
          mode: "custom",
          custom: {
            blue: DEFAULT_VIEWER_CUSTOM_COLORS.left,
            red: DEFAULT_VIEWER_CUSTOM_COLORS.right,
          },
        },
      })
    );
    storage.setItem(
      "tka_mandala_view_state",
      JSON.stringify({ customBlue: "#123456", customRed: "#abcdef" })
    );

    expect(loadViewerCustomColorPreference(storage)).toEqual({
      left: "#123456",
      right: "#abcdef",
    });
  });

  it("uses Tunnel deterministically when both legacy pairs were authored", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tka_tunnel_view_state",
      JSON.stringify({
        colors: {
          mode: "custom",
          custom: { blue: "#112233", red: "#445566" },
        },
      })
    );
    storage.setItem(
      "tka_mandala_view_state",
      JSON.stringify({ customBlue: "#778899", customRed: "#aabbcc" })
    );

    expect(loadViewerCustomColorPreference(storage)).toEqual({
      left: "#112233",
      right: "#445566",
    });
  });

  it("can inspect a legacy preference without writing from an ephemeral editor", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tka_mandala_view_state",
      JSON.stringify({ customBlue: "#123456", customRed: "#abcdef" })
    );

    expect(loadViewerCustomColorPreference(storage, false)).toEqual({
      left: "#123456",
      right: "#abcdef",
    });
    expect(storage.getItem(VIEWER_CUSTOM_COLORS_STORAGE_KEY)).toBeNull();
  });

  it("consumes a staged artifact pair once without writing a preference", () => {
    const storage = new MemoryStorage();
    stageViewerCustomColors({ left: "#123456", right: "#abcdef" }, storage);

    expect(consumeStagedViewerCustomColors(storage)).toEqual({
      left: "#123456",
      right: "#abcdef",
    });
    expect(storage.getItem(STAGED_VIEWER_CUSTOM_COLORS_STORAGE_KEY)).toBeNull();
    expect(consumeStagedViewerCustomColors(storage)).toBeNull();
  });
});

describe("shared viewer custom color state", () => {
  it("synchronizes both controllers without changing either appearance mode", () => {
    const persist = vi.fn();
    const state = createViewerCustomColorState(
      resolveViewerCustomColorPair({ left: "#001122", right: "#334455" }),
      persist
    );
    const pathPolicy = new AnimationVisibilityStateManager({ ephemeral: true });
    let tunnel!: TunnelViewController;
    let mandala!: MandalaViewerController;

    const cleanup = effect_root(() => {
      tunnel = new TunnelViewController({
        getSequence: () => ({ steps: [] }) as SequenceData,
        customColorState: state,
        persistViewState: false,
      });
      mandala = new MandalaViewerController(
        {
          getSequence: () => ({ steps: [] }) as SequenceData,
          getLeftPropType: () => "staff",
          getRightPropType: () => "staff",
          pathPolicy,
          customColorState: state,
        },
        { persistViewState: false }
      );
    });

    tunnel.colorMode = "hands";
    mandala.preset = "aurora";
    mandala.colorMode = "flow";

    tunnel.setCustomPropColor("left", "#00d4ff");
    expect(mandala.customLeft).toBe("#00d4ff");
    expect(tunnel.colorMode).toBe("hands");
    expect(tunnel.exactPropColors).toBeNull();
    expect(mandala.preset).toBe("aurora");

    mandala.customRight = "#ffb000";
    expect(tunnel.customPropColors.right).toBe("#ffb000");
    expect(mandala.colorMode).toBe("flow");
    expect(persist).toHaveBeenLastCalledWith({
      left: "#00d4ff",
      right: "#ffb000",
    });

    tunnel.colors = {
      mode: "custom",
      custom: { left: "#abcdef", right: "#123456" },
    };
    expect(mandala.customLeft).toBe("#abcdef");
    expect(mandala.customRight).toBe("#123456");
    expect(persist).toHaveBeenCalledTimes(2);

    mandala.preset = "custom";
    expect(mandala.accentPair).toEqual(["#abcdef", "#123456"]);
    tunnel.colorMode = "custom";
    expect(tunnel.exactPropColors).toEqual({
      left: "#abcdef",
      right: "#123456",
    });

    cleanup();
  });

  it("lets the focused Mandala persist colors without saving its other look", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const pathPolicy = new AnimationVisibilityStateManager({ ephemeral: true });
    let mandala!: MandalaViewerController;

    const cleanup = effect_root(() => {
      mandala = new MandalaViewerController(
        {
          getSequence: () => ({ steps: [] }) as SequenceData,
          getLeftPropType: () => "staff",
          getRightPropType: () => "staff",
          pathPolicy,
        },
        {
          viewOverrides: { colorMode: "solid", preset: "custom" },
          persistViewState: false,
          persistCustomColors: true,
        }
      );
    });

    mandala.customLeft = "#00d4ff";

    expect(
      JSON.parse(storage.getItem(VIEWER_CUSTOM_COLORS_STORAGE_KEY)!)
    ).toMatchObject({ colors: { left: "#00d4ff" } });
    expect(storage.getItem("tka_mandala_view_state")).toBeNull();

    cleanup();
  });
});
