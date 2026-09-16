import type { AppSettings } from "../../../settings/domain/app-settings";
import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { browser } from "$app/environment";

const _debug = createComponentLogger("VisibilityManager");

let settingsServiceInstance: SettingsState | null = null;

async function getSettingsService(): Promise<SettingsState | null> {
  if (!browser) return null;
  if (!settingsServiceInstance) {
    const { settingsService } =
      await import("../../../settings/state/settings-state.svelte");
    settingsServiceInstance = settingsService;
  }
  return settingsServiceInstance;
}

type VisibilityObserver = () => void;

type VisibilityCategory = "glyph" | "non_radial" | "all" | "buttons";

interface VisibilitySettings {
  reversalIndicators: boolean;
  tkaGlyph: boolean;
  tndGlyph: boolean;
  elementalGlyph: boolean;
  /** Prop timing-and-direction element (top-right). */
  propTndGlyph: boolean;
  placementsGlyph: boolean;
  showGrid: boolean;
  nonRadialPoints: boolean;
  /** L/R colour key on the start position. */
  handColorKey: boolean;
  handPointVisibility: "all" | "active" | "none";
  stepNumbers: boolean;
}

export class VisibilityStateManager {
  private settings: VisibilitySettings;
  private observers: Map<VisibilityCategory, Set<VisibilityObserver>> =
    new Map();

  private readonly DEPENDENT_GLYPHS = [
    "tkaGlyph",
    "tndGlyph",
    "elementalGlyph",
    "placementsGlyph",
  ];

  private settingsLoadedPromise: Promise<void> | null = null;
  private settingsLoadedResolve: (() => void) | null = null;

  private persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly PERSIST_DEBOUNCE_MS = 100;

  constructor(initialSettings?: Partial<AppSettings>) {
    this.settings = {
      reversalIndicators: true,
      tkaGlyph: true,
      tndGlyph: false,
      elementalGlyph: false,
      propTndGlyph: false,
      placementsGlyph: false,
      showGrid: true,
      nonRadialPoints: false,
      handColorKey: true,
      handPointVisibility: "all",
      stepNumbers: true,
      ...this.convertAppSettingsToVisibility(initialSettings),
    };

    this.observers.set("glyph", new Set());
    this.observers.set("non_radial", new Set());
    this.observers.set("all", new Set());
    this.observers.set("buttons", new Set());

    if (browser) {
      this.settingsLoadedPromise = new Promise((resolve) => {
        this.settingsLoadedResolve = resolve;
      });
      this.loadPersistedSettings();
    }
  }

  async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoadedPromise) {
      await this.settingsLoadedPromise;
    }
  }

  private async loadPersistedSettings(): Promise<void> {
    try {
      const service = await getSettingsService();

      if (service?.settings?.visibility) {
        const v = service.settings.visibility;

        if (v.tkaGlyph !== undefined) this.settings.tkaGlyph = v.tkaGlyph;
        if (v.tndGlyph !== undefined) this.settings.tndGlyph = v.tndGlyph;
        if (v.elementalGlyph !== undefined)
          this.settings.elementalGlyph = v.elementalGlyph;
        if (v.propTndGlyph !== undefined)
          this.settings.propTndGlyph = v.propTndGlyph;
        if (v.placementsGlyph !== undefined)
          this.settings.placementsGlyph = v.placementsGlyph;
        if (v.reversalIndicators !== undefined)
          this.settings.reversalIndicators = v.reversalIndicators;
        if (v.showGrid !== undefined) this.settings.showGrid = v.showGrid;
        if (v.nonRadialPoints !== undefined)
          this.settings.nonRadialPoints = v.nonRadialPoints;
        if (v.handColorKey !== undefined)
          this.settings.handColorKey = v.handColorKey;
        if (v.handPointVisibility !== undefined)
          this.settings.handPointVisibility = v.handPointVisibility;
        if (v.stepNumbers !== undefined)
          this.settings.stepNumbers = v.stepNumbers;

        this.notifyObservers(["all"]);
      }
    } finally {
      if (this.settingsLoadedResolve) {
        this.settingsLoadedResolve();
        this.settingsLoadedResolve = null;
      }
    }
  }

  private debouncedPersistSettings(): void {
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
    }
    this.persistDebounceTimer = setTimeout(() => {
      this.persistDebounceTimer = null;
      this.persistSettings();
    }, VisibilityStateManager.PERSIST_DEBOUNCE_MS);
  }

  private async persistSettings(): Promise<void> {
    if (this.settingsLoadedPromise) {
      await this.settingsLoadedPromise;
    }

    const service = await getSettingsService();
    if (!service) return;

    const visibilitySettings = {
      tkaGlyph: this.settings.tkaGlyph,
      tndGlyph: this.settings.tndGlyph,
      elementalGlyph: this.settings.elementalGlyph,
      propTndGlyph: this.settings.propTndGlyph,
      placementsGlyph: this.settings.placementsGlyph,
      reversalIndicators: this.settings.reversalIndicators,
      showGrid: this.settings.showGrid,
      nonRadialPoints: this.settings.nonRadialPoints,
      handColorKey: this.settings.handColorKey,
      handPointVisibility: this.settings.handPointVisibility,
      stepNumbers: this.settings.stepNumbers,
    };

    await service.updateSetting("visibility", visibilitySettings);
  }

  private convertAppSettingsToVisibility(
    _appSettings?: Partial<AppSettings>
  ): Partial<VisibilitySettings> {
    return {};
  }

  public toAppSettings(): Record<string, boolean> {
    return {
      tkaGlyph: this.settings.tkaGlyph,
      reversalIndicators: this.settings.reversalIndicators,
      tndGlyph: this.settings.tndGlyph,
      elementalGlyph: this.settings.elementalGlyph,
      propTndGlyph: this.settings.propTndGlyph,
      placementsGlyph: this.settings.placementsGlyph,
      nonRadialPoints: this.settings.nonRadialPoints,
      handColorKey: this.settings.handColorKey,
    };
  }

  registerObserver(
    callback: VisibilityObserver,
    categories: VisibilityCategory[] = ["all"]
  ): void {
    categories.forEach((category) => {
      if (!this.observers.has(category)) {
        this.observers.set(category, new Set());
      }
      const categoryObservers = this.observers.get(category);
      if (categoryObservers) {
        categoryObservers.add(callback);
      }
    });
  }

  unregisterObserver(callback: VisibilityObserver): void {
    this.observers.forEach((observerSet) => {
      observerSet.delete(callback);
    });
  }

  private notifyObservers(categories: VisibilityCategory[]): void {
    const callbacksToNotify = new Set<VisibilityObserver>();

    categories.forEach((category) => {
      const observers = this.observers.get(category);
      if (observers) {
        observers.forEach((callback) => callbacksToNotify.add(callback));
      }
    });

    const allObservers = this.observers.get("all");
    if (allObservers) {
      allObservers.forEach((callback) => callbacksToNotify.add(callback));
    }

    callbacksToNotify.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("Error in visibility observer:", error);
      }
    });
  }

  getGlyphVisibility(glyphType: string): boolean {
    return (
      (this.settings[glyphType as keyof VisibilitySettings] as boolean) ?? false
    );
  }

  setGlyphVisibility(glyphType: string, visible: boolean): void {
    if (glyphType in this.settings) {
      (this.settings as unknown as Record<string, boolean>)[glyphType] =
        visible;
      this.notifyObservers(["glyph"]);
      this.debouncedPersistSettings();
    }
  }

  getRawGlyphVisibility(glyphType: string): boolean {
    return (
      (this.settings[glyphType as keyof VisibilitySettings] as boolean) ?? false
    );
  }

  isGlyphDependent(glyphType: string): boolean {
    return this.DEPENDENT_GLYPHS.includes(glyphType);
  }

  getGridVisibility(): boolean {
    return this.settings.showGrid;
  }

  setGridVisibility(visible: boolean): void {
    this.settings.showGrid = visible;
    this.notifyObservers(["all"]);
    this.debouncedPersistSettings();
  }

  getNonRadialVisibility(): boolean {
    return this.settings.nonRadialPoints;
  }

  setNonRadialVisibility(visible: boolean): void {
    this.settings.nonRadialPoints = visible;
    this.notifyObservers(["non_radial"]);
    this.debouncedPersistSettings();
  }

  getHandPointVisibility(): "all" | "active" | "none" {
    return this.settings.handPointVisibility;
  }

  setHandPointVisibility(mode: "all" | "active" | "none"): void {
    this.settings.handPointVisibility = mode;
    this.notifyObservers(["all"]);
    this.debouncedPersistSettings();
  }

  getStepNumbersVisibility(): boolean {
    return this.settings.stepNumbers;
  }

  setStepNumbersVisibility(visible: boolean): void {
    this.settings.stepNumbers = visible;
    this.notifyObservers(["all"]);
    this.debouncedPersistSettings();
  }

  getDarkMode(): boolean {
    if (!this._animationVisibilityManager) {
      this._loadAnimationVisibilityManager();
    }
    return this._animationVisibilityManager?.isDarkMode() ?? false;
  }

  private _animationVisibilityManager: { isDarkMode(): boolean } | null = null;

  private _loadAnimationVisibilityManager(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module =
        require("../../../animation-engine/state/animation-visibility-state.svelte") as {
          getAnimationVisibilityManager: () => { isDarkMode(): boolean };
        };
      this._animationVisibilityManager = module.getAnimationVisibilityManager();
    } catch {
      // Silent
    }
  }

  getVisibleGlyphs(): string[] {
    return [
      "tkaGlyph",
      "reversalIndicators",
      "tndGlyph",
      "elementalGlyph",
      "propTndGlyph",
      "placementsGlyph",
      "handColorKey",
    ].filter((glyph) => this.getGlyphVisibility(glyph));
  }

  getAvailableDependentGlyphs(): string[] {
    return this.DEPENDENT_GLYPHS.filter((glyph) =>
      this.getRawGlyphVisibility(glyph)
    );
  }

  updateFromAppSettings(appSettings: AppSettings): void {
    const visibilityUpdate = this.convertAppSettingsToVisibility(appSettings);
    Object.assign(this.settings, visibilityUpdate);
    this.notifyObservers(["all"]);
  }

  getState(): VisibilitySettings {
    return { ...this.settings };
  }
}

let globalVisibilityStateManager: VisibilityStateManager | null = null;

export function getVisibilityStateManager(
  initialSettings?: Partial<AppSettings>
): VisibilityStateManager {
  if (!globalVisibilityStateManager) {
    globalVisibilityStateManager = new VisibilityStateManager(initialSettings);
  }
  return globalVisibilityStateManager;
}

export function resetVisibilityStateManager(): void {
  globalVisibilityStateManager = null;
}
