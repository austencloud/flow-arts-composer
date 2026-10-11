import { describe, expect, it, vi } from "vitest";

vi.mock("$app/env/public", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule({
    PUBLIC_POSTHOG_HOST: "https://test.posthog.com",
    PUBLIC_POSTHOG_KEY: "test-key",
    PUBLIC_POSTHOG_PROJECT_ID: "test-project",
  });
});
import {
  createScanSessionState,
  finishScanSession,
  recordScanSessionInteraction,
  scanExportSessionInteraction,
} from "#lib/shared/analytics/scan-analytics.js";

describe("scan analytics session summary", () => {
  it("aggregates semantic outcomes from the usable-viewer window", () => {
    let state = {
      ...createScanSessionState(10),
      viewerOpenedAt: 100,
      lastMode: "split",
    };

    state = recordScanSessionInteraction(state, {
      mode: "animation",
      played: true,
    });
    state = recordScanSessionInteraction(state, { practiced: true });
    state = recordScanSessionInteraction(state, { exported: true });

    const result = finishScanSession(state, "close_button", 1_350);

    expect(result?.summary).toEqual({
      duration_ms: 1_250,
      interaction_count: 3,
      last_mode: "animation",
      played: true,
      practiced: true,
      exported: true,
      exit_reason: "close_button",
    });
  });

  it("deduplicates exit paths and ignores viewers that never opened", () => {
    const unopened = createScanSessionState(10);
    expect(finishScanSession(unopened, "route_unmount", 20)).toBeNull();

    const opened = { ...unopened, viewerOpenedAt: 15, lastMode: "split" };
    const firstExit = finishScanSession(opened, "pagehide", 25);
    expect(firstExit?.summary.exit_reason).toBe("pagehide");
    expect(
      firstExit && finishScanSession(firstExit.state, "route_unmount", 30)
    ).toBeNull();
  });

  it("does not mutate or count interactions after a session has ended", () => {
    const ended = {
      ...createScanSessionState(10),
      viewerOpenedAt: 20,
      ended: true,
    };

    expect(recordScanSessionInteraction(ended, { played: true })).toBe(ended);
  });

  it("counts export intent once while lifecycle stages update outcomes", () => {
    let state = {
      ...createScanSessionState(10),
      viewerOpenedAt: 20,
    };

    state = recordScanSessionInteraction(
      state,
      scanExportSessionInteraction("requested")
    );
    for (const stage of ["gated", "started", "failed"] as const) {
      state = recordScanSessionInteraction(
        state,
        scanExportSessionInteraction(stage)
      );
    }

    expect(state.interactionCount).toBe(1);
    expect(state.exported).toBe(false);

    state = recordScanSessionInteraction(
      state,
      scanExportSessionInteraction("retry")
    );
    state = recordScanSessionInteraction(
      state,
      scanExportSessionInteraction("completed")
    );
    expect(state.interactionCount).toBe(2);
    expect(state.exported).toBe(true);

    state = recordScanSessionInteraction(
      state,
      scanExportSessionInteraction("canceled")
    );
    expect(state.interactionCount).toBe(2);

    state = recordScanSessionInteraction(
      state,
      scanExportSessionInteraction("canceled", true)
    );
    expect(state.interactionCount).toBe(3);
  });

  it("keeps derived semantic events without counting a second touch", () => {
    let state = {
      ...createScanSessionState(10),
      viewerOpenedAt: 20,
    };

    state = recordScanSessionInteraction(state, {
      mode: "animation",
      count: false,
    });
    state = recordScanSessionInteraction(state, { played: true });

    expect(state.interactionCount).toBe(1);
    expect(state.lastMode).toBe("animation");
    expect(state.played).toBe(true);
  });
});
