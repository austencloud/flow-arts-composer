/**
 * Animation Visibility Sync Service Implementation
 *
 * Provides a clean interface for components to subscribe to all
 * animation visibility settings at once.
 */

import {
  getAnimationVisibilityManager,
  type AnimationVisibilityStateManager,
} from "../state/animation-visibility-state.svelte";
import type {
  EffectType,
  TipEffectMap,
} from "../domain/types/tip-effect-types";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";

/**
 * All visibility settings as a single object
 */
export interface AnimationVisibilityState {
  grid: boolean;
  stepNumbers: boolean;
  props: boolean;
  trails: boolean;
  tkaGlyph: boolean; // TKA Glyph includes turn numbers
  /** Hand timing-and-direction glyph. The prop glyph is overlay-only and
   *  read straight from the visibility manager, so it is not mirrored here. */
  elementalGlyph: boolean;
  /** Dark Mode: dark background, inverted grid, white text/outlines */
  darkMode: boolean;
  /** Word header overlay showing sequence name */
  wordHeader: boolean;
  /** Engine-aligned mandala path guide beneath the 2D animation */
  mandala: boolean;
  activeEffect: EffectType;
  tipEffectMap: TipEffectMap;
}

/**
 * Callback for visibility state changes
 */
export type VisibilityStateCallback = (state: AnimationVisibilityState) => void;

export class AnimationVisibilitySynchronizer {
  private manager: AnimationVisibilityStateManager;
  private callbacks: Set<VisibilityStateCallback> = new Set();
  private boundObserver: () => void;
  /** When set, activeEffect, tipEffectMap, and trails are read from here. */
  effectsConfigState: EffectsConfigState | null = null;

  constructor(managerOverride?: AnimationVisibilityStateManager) {
    this.manager = managerOverride ?? getAnimationVisibilityManager();
    this.boundObserver = () => this.notifySubscribers();
    this.manager.registerObserver(this.boundObserver);
  }

  getState(): AnimationVisibilityState {
    const ecs = this.effectsConfigState;
    const tipEffectMap: TipEffectMap = ecs?.tipEffectMap ?? {};
    const trailsActive = Object.values(tipEffectMap).some(
      (a) => a.effect === "trails"
    );
    const activeEffect = (ecs?.activeEffect ?? "none") as EffectType;
    return {
      grid: this.manager.isGridVisible(),
      stepNumbers: this.manager.getVisibility("stepNumbers"),
      props: this.manager.getVisibility("props"),
      trails: trailsActive,
      tkaGlyph: this.manager.getVisibility("tkaGlyph"), // TKA Glyph includes turn numbers
      elementalGlyph: this.manager.getVisibility("elementalGlyph"),
      darkMode: this.manager.isDarkMode(),
      wordHeader: this.manager.getVisibility("wordHeader"),
      mandala: this.manager.getVisibility("mandala"),
      activeEffect,
      tipEffectMap,
    };
  }

  subscribe(callback: VisibilityStateCallback): () => void {
    this.callbacks.add(callback);
    // Immediately call with current state
    callback(this.getState());

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  dispose(): void {
    this.manager.unregisterObserver(this.boundObserver);
    this.callbacks.clear();
  }

  private notifySubscribers(): void {
    const state = this.getState();
    this.callbacks.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.error(
          "[AnimationVisibilitySynchronizer] Error in callback:",
          error
        );
      }
    });
  }
}
