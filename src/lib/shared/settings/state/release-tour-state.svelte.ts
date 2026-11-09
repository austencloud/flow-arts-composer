/**
 * Release tour: the one arrival a release note's "Show me" can leave behind.
 *
 * A plain note just opens its module and tab. A highlight can also pulse the
 * element marked `data-release-anchor="<anchor>"`, or, when that element is not
 * on the page, show its one-sentence callout until dismissed or the reader
 * moves on. At most one arrival is pending; a new "Show me" replaces it.
 *
 * Singleton like whatsNewState: the button lives in a modal or in Settings and
 * the arrival happens in whatever module the note names, so there is no shared
 * component tree to carry a context through.
 */

import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
import { getAccessibleSectionsForModule } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
import {
  getModuleDefinition,
  isValidModule,
  isValidTabForModule,
} from "#lib/shared/navigation/services/navigation-validator.js";
import { normalizeSectionId } from "#lib/shared/navigation/config/module-definitions.js";
import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { resolveAccessTier } from "#lib/shared/auth/domain/access-tier.js";
import { isPremiumOrAbove } from "#lib/shared/auth/domain/models/user-role.js";
import { isModuleAccessible } from "#lib/shared/auth/domain/guest-access-config.js";
import type { ModuleId } from "#lib/shared/navigation/domain/types.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import {
  resolveArrival,
  type ShowMeTarget,
  type SurfaceChecks,
} from "#lib/shared/versioning/domain/utils/release-surface.js";

/** How long a target tab gets to mount its anchor before the callout takes over. */
const ANCHOR_WAIT_MS = 2500;
/** A reduced-motion outline has no animation to end, so it lifts after this. */
const STILL_OUTLINE_MS = DURATION.dramatic * 6;

/**
 * The live answers for "Show me": the module is registered, live in this
 * environment, not a link-out, and open to this reader's tier and flags; the
 * tab is one the navigation would actually show them.
 */
export function liveSurfaceChecks(): SurfaceChecks {
  const tier = resolveAccessTier(
    authState.isAuthenticated,
    authState.isAnonymous,
    isPremiumOrAbove(authState.role)
  );
  return {
    canOpenModule: (module) =>
      isValidModule(module) &&
      !getModuleDefinition(module)?.linkHref &&
      featureFlagService.canAccessModule(module) &&
      isModuleAccessible(module, tier),
    canOpenTab: (module, tab) => {
      if (!isValidModule(module) || !isValidTabForModule(module, tab)) {
        return false;
      }
      const id = normalizeSectionId(module, tab) ?? tab;
      return getAccessibleSectionsForModule(module).some((s) => s.id === id);
    },
  };
}

function waitForAnchor(anchor: string): Promise<HTMLElement | null> {
  const selector = `[data-release-anchor="${CSS.escape(anchor)}"]`;
  const started = performance.now();
  return new Promise((resolve) => {
    const look = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return resolve(element);
      if (performance.now() - started > ANCHOR_WAIT_MS) return resolve(null);
      requestAnimationFrame(look);
    };
    look();
  });
}

function pulse(element: HTMLElement): void {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    block: "center",
    behavior: still ? "auto" : "smooth",
  });
  // The ring is drawn by ReleaseTourArrival's global style.
  element.setAttribute("data-release-arrived", "");
  const lift = () => element.removeAttribute("data-release-arrived");
  if (still) window.setTimeout(lift, STILL_OUTLINE_MS);
  else element.addEventListener("animationend", lift, { once: true });
}

class ReleaseTourState {
  /** The callout on screen, or null. */
  callout = $state<string | null>(null);
  /** Where the callout belongs; leaving it clears the callout. */
  calloutAt = $state<{ module: string; tab: string | null } | null>(null);

  private tourId = 0;

  /** Open a note's destination, then greet the reader if it is a highlight. */
  async go(target: ShowMeTarget): Promise<void> {
    const id = ++this.tourId;
    this.dismiss();
    await handleModuleChange(target.module as ModuleId, target.tab);
    if (!target.anchor && !target.callout) return;

    const element = target.anchor ? await waitForAnchor(target.anchor) : null;
    // A second "Show me" while this one waited wins.
    if (id !== this.tourId) return;

    const arrival = resolveArrival(target, () => element);
    if (arrival.kind === "pulse") {
      pulse(arrival.element);
    } else if (arrival.kind === "callout") {
      this.callout = arrival.text;
      this.calloutAt = {
        module: navigationState.currentModule,
        tab: navigationState.activeTab ?? null,
      };
    }
  }

  /** Dismissed callouts never come back. */
  dismiss(): void {
    this.callout = null;
    this.calloutAt = null;
  }
}

export const releaseTourState = new ReleaseTourState();
