/**
 * Create Module Context
 *
 * Provides shared state and services to all descendant components via Svelte's context API.
 * This eliminates prop drilling and makes the component tree more maintainable.
 *
 * Usage:
 * - In CreateModule: setCreateModuleContext({ ... })
 * - In child components: const ctx = getCreateModuleContext()
 *
 * Domain: Create module - Context management
 */

import { getContext, setContext } from "svelte";
import type { createCreateModuleState as CreateModuleStateType } from "../state/create-module-state.svelte";
import type { createConstructTabState as ConstructTabStateType } from "../state/construct-tab-state.svelte";
import type { PanelCoordinationState } from "../state/panel-coordination-state.svelte";
import type { CreateModuleOrchestrators } from "../types/create-module-services";
import type { SessionManager } from "../services/session-manager.svelte";
import type { Autosaver } from "../services/autosaver";
import type { LibraryRepository } from "$lib/shared/library/services/library-repository";
import type { ConstructTutorialState } from "$lib/features/create/construct/tutorial/state/construct-tutorial-state.svelte";
import type { SequenceTransformActionDispatcher } from "../services/sequence-transform-action-dispatcher";

type CreateModuleState = ReturnType<typeof CreateModuleStateType>;
type ConstructTabState = ReturnType<typeof ConstructTabStateType>;

/**
 * Context interface for Create Module
 * Provides all shared state and services to descendant components
 */
export interface CreateModuleContext {
  // Core state
  CreateModuleState: CreateModuleState;
  constructTabState: ConstructTabState;
  constructTutorialState: ConstructTutorialState;
  panelState: PanelCoordinationState;
  getSequenceTransformActions: () => SequenceTransformActionDispatcher | null;

  // Services
  services: CreateModuleOrchestrators;

  // Session management services
  sessionManager: SessionManager | null;
  autosaver: Autosaver | null;
  libraryRepository: LibraryRepository | null;

  // Layout state
  layout: {
    shouldUseSideBySideLayout: boolean;
    isMobilePortrait: () => boolean;
    /** Input mode active - keyboard is up, collapse workspace */
    isInputMode: boolean;
    /** Set input mode (called by SpellPanel when word input is focused) */
    setInputMode: (mode: boolean) => void;
  };

  // Common handlers
  handlers: {
    onError: (error: string) => void;
    /**
     * Route a "delete the start placement" gesture to the module-owned
     * clear-sequence flow: confirmation dialog (unless opted out), undo
     * snapshot, and return to the start-placement picker. A start placement
     * with no sequence steps behind it is invalid state — partial clears
     * (setStartPlacement(null) while steps remain) are forbidden.
     */
    requestClearSequence: () => void;
  };
}

const CONTEXT_KEY = "createModule";

export function setCreateModuleContext(context: CreateModuleContext): void {
  setContext(CONTEXT_KEY, context);
}

/**
 * Get the Create Module context
 * Call this in child components to access shared state and services
 */
export function getCreateModuleContext(): CreateModuleContext {
  const context = getContext<CreateModuleContext>(CONTEXT_KEY);

  if (!context) {
    throw new Error(
      "CreateModuleContext not found. Make sure you're calling getCreateModuleContext() " +
        "within a component that is a descendant of CreateModule."
    );
  }

  return context;
}

/**
 * Optional: Get the Create Module context if it exists
 * Returns undefined if context is not available
 */
export function tryGetCreateModuleContext(): CreateModuleContext | undefined {
  return getContext<CreateModuleContext>(CONTEXT_KEY);
}
