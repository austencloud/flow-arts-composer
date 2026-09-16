/**
 * Sensors — the ghost's reading of the live app
 * (spec: 2026-08-04-ghost-mind-design.md §Sensors: the actual engineering).
 *
 * The scoring is trivial. Knowing truthfully whether the 3D viewer is openable
 * RIGHT NOW is not, and when a precondition lies the ghost reaches for
 * something that isn't there and reads as broken. This file is where that work
 * and that rot live, so it is kept under one discipline:
 *
 *   sensors read the DOM and the route, never feature code.
 *
 * That is what makes the presenter a zero-dependency observer rather than a
 * consumer of 26 modules' state — it cannot break the app, and the app cannot
 * break it beyond a kind going quiet. Where the DOM genuinely cannot answer a
 * question the component publishes one attribute (`data-ghost-state`), which
 * travels with the component through refactors.
 */

import { MODULE_DEFINITIONS } from "$lib/shared/navigation/config/module-definitions";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import {
  LINGER_SEL,
  NAV_MODULE_ID_ATTR,
  NAV_MODULE_SEL,
  NAV_TAB_SEL,
  WORD_SEL,
  isDeniedModule,
  readable,
  safe,
  stateSel,
  type GhostKind,
} from "../domain/annotations";
import { EMPTY_WORLD, type GhostWorld } from "../domain/intention";

const KINDS: GhostKind[] = Object.keys(EMPTY_WORLD.available) as GhostKind[];

const MODULE_IDS = new Set(MODULE_DEFINITIONS.map((m) => m.id as string));

/**
 * Really on screen — not display:none, not zero-sized, and the pixel at its
 * center actually belongs to it. The same hit-test the motor layer uses before
 * a press, applied one step earlier so an occluded control never even scores.
 */
export function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.bottom < 0 || r.top > window.innerHeight) return false;
  if (r.right < 0 || r.left > window.innerWidth) return false;
  const probe = document.elementFromPoint(
    r.left + r.width / 2,
    r.top + r.height / 2,
  );
  return !!probe && (el.contains(probe) || probe.contains(el));
}

export function visibleAll(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(isVisible);
}

/** Module + tab from the route, the same shape the navigator writes. */
export function readRoute(pathname: string): {
  moduleId: string | null;
  tabId: string | null;
} {
  const path = pathname.startsWith("/app") ? pathname.slice(4) : pathname;
  const parts = path.split("/").filter(Boolean);
  const moduleId = parts[0] && MODULE_IDS.has(parts[0]) ? parts[0] : null;
  return { moduleId, tabId: moduleId ? (parts[1] ?? null) : null };
}

export function createSensors(): { sense: () => GhostWorld } {
  /**
   * Cached because `sense()` is synchronous and the Permissions API is not, and
   * because asking on every tick would be wasteful. Fails closed: if the query
   * throws or the browser does not implement the camera permission (Safari),
   * this stays false and the ghost never touches practice. A native permission
   * prompt is not DOM — it cannot be pressed, dismissed or even seen by the
   * hit-test, so triggering one strands the tour.
   */
  let cameraGranted = false;
  void (async () => {
    try {
      const status = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      cameraGranted = status.state === "granted";
      status.onchange = () => {
        cameraGranted = status.state === "granted";
      };
    } catch {
      cameraGranted = false;
    }
  })();

  function sense(): GhostWorld {
    if (typeof document === "undefined") return EMPTY_WORLD;

    const { moduleId, tabId } = readRoute(window.location.pathname);

    const available = {} as Record<GhostKind, number>;
    for (const kind of KINDS) {
      available[kind] = visibleAll(safe(kind)).length;
    }
    // Nav modules come from the sidebar package's own identity attribute
    // rather than an annotation TKA would have to fork the package to add.
    const navModules = visibleAll(NAV_MODULE_SEL);
    available["nav-module"] = navModules.length;
    available["nav-tab"] = visibleAll(NAV_TAB_SEL).length;

    // Step cells are read, not pressed, during the build — count every one
    // that is on screen, annotated pressable or not.
    const stepCells = visibleAll(readable("step-cell"));

    const rawWord =
      document.querySelector<HTMLElement>(WORD_SEL)?.dataset.ghostWord ?? null;

    return {
      moduleId,
      tabId,
      hasSequence: stepCells.length > 0,
      sequenceLength: stepCells.length,
      // A LOOP's word repeats by construction and the ghost must never think
      // "nice, FΨFΨFΨFΨ" (simplified-word-display.md).
      sequenceWord: rawWord ? simplifyRepeatedWord(rawWord) : null,
      isPlaying: !!document.querySelector(stateSel("playing")),
      activeEffectIds: visibleAll(`${safe("effect")}[data-ghost-active]`)
        .map((el) => el.dataset.ghostId ?? "")
        .filter(Boolean),
      viewerOpen: !!document.querySelector(stateSel("viewer-open")),
      pickerOpen: available.option > 0 || available["start-placement"] > 0,
      reachableModules: navModules
        .map((el) => el.getAttribute(NAV_MODULE_ID_ATTR) ?? "")
        .filter((id) => id && MODULE_IDS.has(id) && !isDeniedModule(id)),
      available,
      lingerCount: visibleAll(LINGER_SEL).length,
      cameraGranted,
      presenting: !!document.querySelector(stateSel("presenting")),
      cameraLive: !!document.querySelector(stateSel("camera-live")),
    };
  }

  return { sense };
}
