import type {
  HapticFeedbackConfig,
  HapticFeedbackType,
  HapticImpactStyle,
  HapticNotificationType,
  IHapticFeedback,
} from "#lib/shared/application/services/contracts/IHapticFeedback";
import type { EffortId, EffortParams } from "#lib/shared/effort/domain/effort-types.js";

interface HapticCall {
  method: string;
  args: unknown[];
  timestamp: number;
}

export class MockHapticFeedback implements IHapticFeedback {
  private calls: HapticCall[] = [];
  private _supported = true;
  private _enabled = true;
  private config: HapticFeedbackConfig = {
    enabled: true,
    respectReducedMotion: true,
    throttleTime: 0,
    customPatterns: {},
  };

  impact(style: HapticImpactStyle): boolean {
    this.calls.push({ method: "impact", args: [style], timestamp: Date.now() });
    return this._supported;
  }

  notification(type: HapticNotificationType): boolean {
    this.calls.push({ method: "notification", args: [type], timestamp: Date.now() });
    return this._supported;
  }

  selection(): boolean {
    this.calls.push({ method: "selection", args: [], timestamp: Date.now() });
    return this._supported;
  }

  trigger(type: HapticFeedbackType = "selection"): boolean {
    this.calls.push({ method: "trigger", args: [type], timestamp: Date.now() });
    return this._supported;
  }

  triggerEffort(effortId: EffortId, params?: EffortParams, durationMs?: number): boolean {
    this.calls.push({ method: "triggerEffort", args: [effortId, params, durationMs], timestamp: Date.now() });
    return this._supported;
  }

  setCustomPattern(name: string, pattern: number[]): void {
    this.config.customPatterns[name] = [...pattern];
  }

  triggerCustom(name: string): boolean {
    this.calls.push({ method: "triggerCustom", args: [name], timestamp: Date.now() });
    return this._supported;
  }

  isSupported(): boolean { return this._supported; }
  setEnabled(enabled: boolean): void { this._enabled = enabled; this.config.enabled = enabled; }
  isEnabled(): boolean { return this._enabled; }
  getConfig(): HapticFeedbackConfig { return { ...this.config }; }
  updateConfig(config: Partial<HapticFeedbackConfig>): void { this.config = { ...this.config, ...config }; }

  getCalls(): HapticCall[] { return [...this.calls]; }
  getCallCount(): number { return this.calls.length; }
  getCallsByMethod(method: string): HapticCall[] { return this.calls.filter(c => c.method === method); }
  clear(): void { this.calls = []; }
  setSupported(supported: boolean): void { this._supported = supported; }
}

export class MockHapticFeedbackService extends MockHapticFeedback {}
