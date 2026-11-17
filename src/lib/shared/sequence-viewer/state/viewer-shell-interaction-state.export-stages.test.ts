import { describe, expect, it, vi } from "vitest";
import type { ScanExitReason } from "#lib/shared/analytics/scan-analytics.js";
import type {
  ExportDeliveryReport,
  ExportRequestOptions,
} from "../components/export-coordinator.svelte";
import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
import { createViewerShellInteractionState } from "./viewer-shell-interaction-state.svelte";

const STAGES = [
  "requested",
  "gated",
  "started",
  "completed",
  "failed",
  "canceled",
  "retry",
];

type Sent = [kind: string, stage: string, properties: Record<string, unknown>];

function setup(options: { overrides?: boolean } = {}) {
  const events: Sent[] = [];
  let listener: ((report: ExportDeliveryReport) => void) | null = null;
  let cleanup: ((reason: ScanExitReason) => void) | null = null;
  const ctx = {
    exportError: null as string | null,
    previewBlobUrl: null as string | null,
    renderMode: "2d",
    playbackMode: "continuous",
    leftPropType: "staff",
    rightPropType: "staff",
    effectiveSequence: { steps: [{}, {}, {}] },
    splitPaneImageComposition: { showStartPos: true, handPathMode: false },
    exportOptions: {
      imageDarkMode: false,
      getVideoOptions: () => ({
        fps: 30,
        loopCount: 1,
        resolution: 1080,
        includeStartPlacement: true,
        includeEndHold: true,
      }),
    },
    handleExport: vi.fn<(o?: ExportRequestOptions) => Promise<boolean>>(),
    handleCancelExport: vi.fn(),
    setExportDeliveryListener: vi.fn(
      (next: ((report: ExportDeliveryReport) => void) | null) => {
        listener = next;
        return () => {
          listener = null;
        };
      }
    ),
  };
  const noop = vi.fn();
  const interactions = createViewerShellInteractionState(
    {
      getContext: () => ctx as unknown as OrchestratorContext,
      getExportOverrides: () =>
        options.overrides
          ? {
              onVideoExport: vi.fn(),
              onCardExport: vi.fn(),
              videoBusy: false,
              videoProgress: null,
              cardBusy: false,
            }
          : undefined,
      getOnRemix: () => undefined,
      getOpenAppHref: () => undefined,
      getOnAccountSignIn: () => undefined,
      onClose: noop,
    },
    {
      navigate: noop,
      openExternalHref: noop,
      captureScanAction: noop,
      captureScanExport: (kind, stage, properties = {}) => {
        events.push([kind, stage, properties]);
      },
      captureScanPlaybackChanged: noop,
      captureScanPracticeChanged: noop,
      captureScanSettingChanged: noop,
      captureScanViewChanged: noop,
      endScanViewerSession: noop,
      registerScanSessionCleanup: (fn) => {
        cleanup = fn;
        return () => {
          cleanup = null;
        };
      },
    }
  );
  interactions.mount();
  return {
    ctx,
    interactions,
    events,
    stages: () => events.map(([, stage]) => stage),
    deliver: (report: ExportDeliveryReport) => listener?.(report),
    endSession: (reason: ScanExitReason) => cleanup?.(reason),
  };
}

/** A render the test settles by hand, after announcing its start. */
function manualRender(ctx: ReturnType<typeof setup>["ctx"]) {
  let settle: (started: boolean) => void = () => {};
  ctx.handleExport.mockImplementationOnce((options) => {
    options?.onRenderStart?.();
    return new Promise<boolean>((resolve) => {
      settle = resolve;
    });
  });
  return (started: boolean) => settle(started);
}

const download: ExportDeliveryReport = {
  kind: "video",
  result: { success: true, method: "download" },
};
const failedShare: ExportDeliveryReport = {
  kind: "video",
  result: { success: false, method: "share" },
};

async function renderedVideo(t: ReturnType<typeof setup>) {
  const settle = manualRender(t.ctx);
  const done = t.interactions.handleVideoExport();
  t.ctx.previewBlobUrl = "blob:preview";
  settle(true);
  await done;
}

describe("video export stages", () => {
  it("reports requested, started, then completed with the delivery method", async () => {
    const t = setup();
    const settle = manualRender(t.ctx);
    const done = t.interactions.handleVideoExport();
    expect(t.stages()).toEqual(["requested", "started"]);

    t.ctx.previewBlobUrl = "blob:preview";
    settle(true);
    await done;
    expect(t.stages()).toEqual(["requested", "started"]);

    t.deliver(download);
    expect(t.stages()).toEqual(["requested", "started", "completed"]);
    expect(t.events[2]?.[2]).toMatchObject({ delivery_method: "download" });
    expect(t.events[2]?.[2]).toMatchObject(t.events[0]![2]);
  });

  it("only ever sends the seven stage names", async () => {
    const t = setup();
    await renderedVideo(t);
    t.deliver(failedShare);
    await renderedVideo(t);
    t.deliver(download);
    expect(t.events.length).toBeGreaterThan(4);
    for (const [, stage] of t.events) expect(STAGES).toContain(stage);
  });

  it("reports a render failure as export_error", async () => {
    const t = setup();
    const settle = manualRender(t.ctx);
    const done = t.interactions.handleVideoExport();
    t.ctx.exportError = "Export failed. Please try again.";
    settle(true);
    await done;
    expect(t.stages()).toEqual(["requested", "started", "failed"]);
    expect(t.events[2]?.[2]).toMatchObject({ reason: "export_error" });
  });

  it("reports a failed hand-over as delivery_error with its method", async () => {
    const t = setup();
    await renderedVideo(t);
    t.deliver({ kind: "video", result: { success: false, method: "download" } });
    expect(t.stages()).toEqual(["requested", "started", "failed"]);
    expect(t.events[2]?.[2]).toMatchObject({
      reason: "delivery_error",
      delivery_method: "download",
    });
  });

  it("reports a dismissed share sheet as one canceled, not user initiated", async () => {
    const t = setup();
    await renderedVideo(t);
    t.deliver({
      kind: "video",
      result: { success: true, canceled: true, method: "share" },
    });
    expect(t.stages()).toEqual(["requested", "started", "canceled"]);
    expect(t.events[2]?.[2]).toMatchObject({
      reason: "share_dismissed",
      user_initiated: false,
    });
  });

  it("sends one canceled for a user cancel and nothing for a late completion", async () => {
    const t = setup();
    const settle = manualRender(t.ctx);
    const done = t.interactions.handleVideoExport();
    t.interactions.handleCancelVideoExport();
    t.ctx.previewBlobUrl = "blob:preview";
    settle(true);
    await done;
    t.deliver(download);
    expect(t.stages()).toEqual(["requested", "started", "canceled"]);
    expect(t.events[2]?.[2]).toMatchObject({ user_initiated: true });
    expect(t.ctx.handleCancelExport).toHaveBeenCalledTimes(1);
  });

  it("sends no started for a refused start and leaves no open attempt", async () => {
    const t = setup();
    t.ctx.handleExport.mockResolvedValueOnce(false);
    await t.interactions.handleVideoExport();
    expect(t.stages()).toEqual(["requested", "canceled"]);
    expect(t.events[1]?.[2]).toMatchObject({ reason: "not_started" });

    t.endSession("pagehide");
    expect(t.stages()).toEqual(["requested", "canceled"]);
  });

  it("ends an open attempt as canceled when the session ends", async () => {
    const t = setup();
    const settle = manualRender(t.ctx);
    const done = t.interactions.handleVideoExport();
    t.endSession("pagehide");
    t.ctx.previewBlobUrl = "blob:preview";
    settle(true);
    await done;
    t.deliver(download);
    expect(t.stages()).toEqual(["requested", "started", "canceled"]);
    expect(t.events[2]?.[2]).toMatchObject({
      reason: "pagehide",
      user_initiated: false,
    });
  });

  it("does not call a finished render completed until it is handed over", async () => {
    const t = setup();
    await renderedVideo(t);
    expect(t.stages()).toEqual(["requested", "started"]);
    t.endSession("close_button");
    expect(t.stages()).toEqual(["requested", "started", "canceled"]);
  });

  it("starts a fresh attempt on retry", async () => {
    const t = setup();
    const settle = manualRender(t.ctx);
    const first = t.interactions.handleVideoExport();
    t.ctx.exportError = "Export failed. Please try again.";
    settle(true);
    await first;

    t.ctx.exportError = null;
    const settleAgain = manualRender(t.ctx);
    const second = t.interactions.handleVideoExport("retry");
    t.ctx.previewBlobUrl = "blob:preview";
    settleAgain(true);
    await second;
    t.deliver(download);
    expect(t.stages()).toEqual([
      "requested",
      "started",
      "failed",
      "retry",
      "started",
      "completed",
    ]);
  });

  it("counts a save tried again after a failed hand-over as a retry", async () => {
    const t = setup();
    await renderedVideo(t);
    t.deliver(failedShare);
    t.deliver(download);
    expect(t.stages()).toEqual([
      "requested",
      "started",
      "failed",
      "retry",
      "completed",
    ]);
    // A further save of the same file is not a new attempt.
    t.deliver(download);
    expect(t.stages()).toHaveLength(5);
  });

  it("leaves a host override to its own lifecycle", async () => {
    const t = setup({ overrides: true });
    await t.interactions.handleVideoExport();
    t.deliver(download);
    t.endSession("pagehide");
    expect(t.stages()).toEqual(["requested"]);
    expect(t.ctx.handleExport).not.toHaveBeenCalled();
  });
});

describe("card export stages", () => {
  it("reports requested, started, completed with the delivery method", async () => {
    const t = setup();
    t.ctx.handleExport.mockImplementationOnce(async (options) => {
      options?.onRenderStart?.();
      t.deliver({
        kind: "card",
        result: { success: true, canceled: false, method: "download" },
      });
      return true;
    });
    t.interactions.handleCardExport();
    await vi.waitFor(() => expect(t.stages()).toContain("completed"));
    expect(t.stages()).toEqual(["requested", "started", "completed"]);
    expect(t.events.every(([kind]) => kind === "card")).toBe(true);
    expect(t.events[2]?.[2]).toMatchObject({ delivery_method: "download" });
  });

  it("reports a failed card render as export_error", async () => {
    const t = setup();
    t.ctx.handleExport.mockImplementationOnce(async (options) => {
      options?.onRenderStart?.();
      t.ctx.exportError = "Export failed. Please try again.";
      return true;
    });
    t.interactions.handleCardExport();
    await vi.waitFor(() => expect(t.stages()).toContain("failed"));
    expect(t.events[2]?.[2]).toMatchObject({ reason: "export_error" });
  });

  it("reports a dismissed card share sheet as canceled", async () => {
    const t = setup();
    t.ctx.handleExport.mockImplementationOnce(async (options) => {
      options?.onRenderStart?.();
      t.deliver({
        kind: "card",
        result: { success: true, canceled: true, method: "share" },
      });
      return true;
    });
    t.interactions.handleCardExport();
    await vi.waitFor(() => expect(t.stages()).toContain("canceled"));
    expect(t.events[2]?.[2]).toMatchObject({ reason: "share_dismissed" });
  });
});
