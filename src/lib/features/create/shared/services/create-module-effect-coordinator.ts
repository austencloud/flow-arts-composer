/**
 * create-module-effect-coordinator.ts
 *
 * Module for coordinating all reactive effects in CreateModule.
 * Centralizes effect setup to reduce complexity in the component.
 *
 * Domain: Create module - Effect Orchestration
 */

import type { CreateModuleState } from "../state/create-module-state.svelte";
import type { ConstructTabState } from "../state/construct-tab-state.svelte";
import type { PanelCoordinationState } from "../state/panel-coordination-state.svelte";
import type { NavigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type { ResponsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
import type { NavigationSyncer } from "./navigation-syncer";
import type { DeepLinkSequenceHandler } from "./deep-link-sequence-handler";
import type { StepOperator } from "./step-operator";
import type { Autosaver } from "./autosaver";
import type { LetterSource } from "$lib/shared/create/domain/spell-models";

/**
 * Configuration for CreateModule effects
 */
export interface CreateModuleEffectConfig {
  getCreateModuleState: () => CreateModuleState | null;
  getConstructTabState: () => ConstructTabState | null;
  panelState: PanelCoordinationState;
  navigationState: NavigationState;

  layoutService: ResponsiveLayoutManager;
  NavigationSyncer: NavigationSyncer;
  getDeepLinker: () => DeepLinkSequenceHandler | null;
  getStepOperator: () => StepOperator | null;
  getAutosaver: () => Autosaver | null;

  isServicesInitialized: () => boolean;

  onLayoutChange: (shouldUseSideBySideLayout: boolean) => void;
  getShouldUseSideBySideLayout: () => boolean;
  setAnimatingStepNumber: (beat: number | null) => void;

  onCurrentWordChange?: (word: string) => void;
  onLetterSourcesChange?: (sources: LetterSource[] | null) => void;
  onTabAccessibilityChange?: (canAccess: boolean) => void;
}

/**
 * Interface for the effect coordinator
 */
export interface CreateModuleEffectCoordinator {
  setupEffects(config: CreateModuleEffectConfig): () => void;
}
import {
  createAutoEditPanelEffect,
  createAutoStepEditorEffect,
} from "../state/managers/auto-edit-panel-manager.svelte";
import { createCurrentWordDisplayEffect } from "../state/managers/current-word-display-manager.svelte";
import { createLayoutEffects } from "../state/managers/layout-manager.svelte";
import { createNavigationSyncEffects } from "../state/managers/navigation-sync-manager.svelte";
import { createPWAEngagementEffect } from "../state/managers/pwa-engagement-manager.svelte";
import { createGlobalStateSyncEffects } from "../state/managers/global-state-sync-manager.svelte";
import { createCreationFlowEffects } from "../state/managers/creation-flow-manager.svelte";
import { createPendingEditEffect } from "../state/managers/pending-edit-manager.svelte";
import { createPropTypeSyncEffect } from "../state/managers/prop-type-sync-manager.svelte";
import { createAutosaveEffect } from "../state/managers/autosave-manager.svelte";

export function setupEffects(config: CreateModuleEffectConfig): () => void {
  const {
    getCreateModuleState,
    getConstructTabState,
    panelState,
    navigationState,
    layoutService,
    NavigationSyncer,
    getDeepLinker,
    getStepOperator,
    getAutosaver,
    isServicesInitialized,
    onLayoutChange,
    getShouldUseSideBySideLayout,
    setAnimatingStepNumber,
    onCurrentWordChange,
    onLetterSourcesChange,
    onTabAccessibilityChange,
  } = config;

  const cleanups: (() => void)[] = [];

  // Global state sync (panel state, layout, animation beat)
  cleanups.push(
    createGlobalStateSyncEffects({
      panelState,
      getShouldUseSideBySideLayout,
      setAnimatingStepNumber,
    })
  );

  // Creation flow (tab accessibility)
  cleanups.push(
    createCreationFlowEffects({
      getCreateModuleState,
      onTabAccessibilityChange,
    })
  );

  // Pending edit processing (from Browse gallery)
  cleanups.push(
    createPendingEditEffect({
      getDeepLinker,
      getCreateModuleState,
      getConstructTabState,
      isServicesInitialized,
    })
  );

  // Prop type sync (bulk update when settings change)
  cleanups.push(
    createPropTypeSyncEffect({
      getStepOperator,
      getCreateModuleState,
      isServicesInitialized,
      getSequenceRevision: () =>
        getCreateModuleState()?.getActiveTabSequenceState()
          .currentSequenceRevision ?? 0,
      // A prop swap rewrites every motion's propType, which advances the
      // sequence revision. Workspace playback stops on a revision it did not
      // start from, so hand it the new baseline — otherwise picking a prop from
      // the selection panel closes the quick viewer mid-sequence.
      onPropTypeSequenceRewrite: (fromRevision, toRevision) =>
        panelState.rebaseWorkspacePlayback(fromRevision, toRevision),
    })
  );

  // Autosave dirty marking
  cleanups.push(
    createAutosaveEffect({
      getCreateModuleState,
      getAutosaver,
    })
  );

  // Navigation sync effects
  const createModuleState = getCreateModuleState();
  if (createModuleState) {
    cleanups.push(
      createNavigationSyncEffects({
        CreateModuleState: createModuleState,
        navigationState,
        NavigationSyncer,
      })
    );
  }

  // Layout effects
  cleanups.push(
    createLayoutEffects({
      layoutService,
      onLayoutChange,
    })
  );

  // Auto edit panel effects (multi-select)
  if (createModuleState) {
    cleanups.push(
      createAutoEditPanelEffect({
        CreateModuleState: createModuleState,
        panelState,
        shouldAutoOpen: () => navigationState.activeTab !== "construct",
      })
    );

    // Auto Beat Editor panel effects
    cleanups.push(
      createAutoStepEditorEffect({
        CreateModuleState: createModuleState,
        panelState,
        shouldAutoOpen: () => navigationState.activeTab !== "construct",
      })
    );

    // PWA engagement tracking
    cleanups.push(
      createPWAEngagementEffect({ CreateModuleState: createModuleState })
    );
  }

  // Current word display effects (and letter sources for spell tab)
  const constructTabState = getConstructTabState();
  if (onCurrentWordChange && createModuleState && constructTabState) {
    cleanups.push(
      createCurrentWordDisplayEffect({
        CreateModuleState: createModuleState,
        constructTabState,
        onCurrentWordChange,
        onLetterSourcesChange,
      })
    );
  }

  // NOTE: Panel height tracking moved to CreateModule.svelte $effect
  // because DOM element bindings happen AFTER onMount completes

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

// SINGLETON EXPORT (satisfies CreateModuleEffectCoordinator interface)
export const createModuleEffectCoordinator: CreateModuleEffectCoordinator = {
  setupEffects,
};
