import { describe, it, expect, vi } from "vitest";
import { EffectController } from "#lib/shared/animation-engine/services/effect-controller.js";

function mockEffectManager() {
  return {
    setFireConfig: vi.fn(),
    getFireConfig: vi.fn().mockReturnValue({ intensity: 0.7 }),
    setLedConfig: vi.fn(),
    getLedConfig: vi.fn().mockReturnValue({ enabled: false }),
    setCellTipEffectMap: vi.fn(),
    setCellTipEffortMap: vi.fn(),
    fireRenderer: { clearSimulation: vi.fn(), invalidateFrameCache: vi.fn(), clearThermalFields: vi.fn() },
    charcoalRenderer: { clearSimulation: vi.fn() },
    ledRenderer: { resetExportState: vi.fn() },
    fireConfig: { intensity: 0.7 },
  } as any;
}

describe("EffectController", () => {
  it("setFireConfig delegates to manager", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    ctrl.setFireConfig({ intensity: 0.9 });
    expect(mgr.setFireConfig).toHaveBeenCalledWith({ intensity: 0.9 });
  });

  it("getFireConfig returns manager config", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    expect(ctrl.getFireConfig()).toEqual({ intensity: 0.7 });
  });

  it("setLedConfig delegates to manager", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    ctrl.setLedConfig({ enabled: true });
    expect(mgr.setLedConfig).toHaveBeenCalledWith({ enabled: true });
  });

  it("getLedConfig returns manager config", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    expect(ctrl.getLedConfig()).toEqual({ enabled: false });
  });

  it("setCellTipEffectMap delegates to manager", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    const map = { tip1: { effect: "fire" } } as any;
    ctrl.setCellTipEffectMap(map);
    expect(mgr.setCellTipEffectMap).toHaveBeenCalledWith(map);
  });

  it("setCellTipEffortMap delegates to manager", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    const map = { tip1: { effort: "high" } } as any;
    ctrl.setCellTipEffortMap(map);
    expect(mgr.setCellTipEffortMap).toHaveBeenCalledWith(map);
  });

  it("invalidateFireCache clears fire + charcoal + LED", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    ctrl.invalidateFireCache();
    expect(mgr.fireRenderer.clearSimulation).toHaveBeenCalled();
    expect(mgr.charcoalRenderer.clearSimulation).toHaveBeenCalled();
    expect(mgr.ledRenderer.resetExportState).toHaveBeenCalled();
  });

  it("invalidateFireFrameCacheOnly calls invalidateFrameCache only", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    ctrl.invalidateFireFrameCacheOnly();
    expect(mgr.fireRenderer.invalidateFrameCache).toHaveBeenCalled();
    expect(mgr.fireRenderer.clearSimulation).not.toHaveBeenCalled();
  });

  it("clearFireThermalFields clears thermal + charcoal + LED", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    ctrl.clearFireThermalFields();
    expect(mgr.fireRenderer.clearThermalFields).toHaveBeenCalled();
    expect(mgr.charcoalRenderer.clearSimulation).toHaveBeenCalled();
    expect(mgr.ledRenderer.resetExportState).toHaveBeenCalled();
  });

  it("captureDiagnostics returns structured object", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    const diag = ctrl.captureDiagnostics({
      isInitialized: true,
      isPlaying: false,
      currentStep: 3,
      canvasSize: 500,
      instanceId: "test-1",
    });
    expect(diag.timestamp).toBeDefined();
    expect(diag.instanceId).toBe("test-1");
    expect(diag.engineState).toBeDefined();
    expect((diag.engineState as any).isInitialized).toBe(true);
    expect((diag.engineState as any).currentStep).toBe(3);
  });

  it("captureDiagnostics includes fireConfig from manager", () => {
    const mgr = mockEffectManager();
    const ctrl = new EffectController(mgr);
    const diag = ctrl.captureDiagnostics({
      isInitialized: false,
      isPlaying: false,
      currentStep: 0,
      canvasSize: 400,
      instanceId: "test-2",
    });
    expect(diag.fireConfig).toEqual({ intensity: 0.7 });
  });

  it("invalidateFireCache handles null renderers gracefully", () => {
    const mgr = {
      ...mockEffectManager(),
      fireRenderer: null,
      charcoalRenderer: null,
      ledRenderer: null,
    } as any;
    const ctrl = new EffectController(mgr);
    expect(() => ctrl.invalidateFireCache()).not.toThrow();
  });
});
