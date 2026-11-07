/**
 * explore — the breadth half of the design. Nothing here enumerates the app:
 * `go-to-module` is one generic navigator that scores highest for modules
 * missing from `visitedModules`, so covering 26 modules is a consequence of
 * novelty rather than a separate mechanism (and a new module is covered the
 * day it appears in the nav, with no authoring).
 */

import {
  NAV_MODULE_ID_ATTR,
  NAV_MODULE_LABEL_SEL,
  NAV_MODULE_SEL,
  NAV_SIDEBAR_SEL,
  NAV_TAB_LABEL_SEL,
  NAV_TAB_SEL,
  isDeniedModule,
  safe,
} from "../domain/annotations";
import type {
  GhostContext,
  GhostNavigationOption,
  Intention,
} from "../domain/intention";
import type { AttractGhost } from "../services/attract-ghost.svelte";
import { visibleAll } from "../services/sensors";
import {
  navigationContextKey,
  navigationSignature,
  recognizesNavigation,
} from "../domain/episodic-memory";
import {
  browseKind,
  has,
  labelOf,
  pressKind,
  restlessness,
  settled,
  watchKind,
  oneOf,
} from "./helpers";
import {
  encounterKey,
  monologueFor,
  noteEncounter,
  reactionFor,
} from "./monologue";

/** Firestore reads cost money at a jam that runs for hours. */
const GALLERY_OPENS_PER_SESSION = 8;

/**
 * The way out of a room with no visible exit, injected by the host so the bag
 * stays free of feature imports. It must perform a REAL module switch (the
 * same one the nav performs), never a URL-only navigation.
 */
let escapeHatch: (() => Promise<void> | void) | null = null;

export function setEscapeHatch(fn: (() => Promise<void> | void) | null): void {
  escapeHatch = fn;
}

/**
 * The last resort when the room has no visible door — an immersive module that
 * hides the sidebar. Goes through the app's OWN module switch, never
 * history.back() or goto(): both move the URL while the module system carries on
 * believing it is elsewhere, and the shell then renders an empty screen until a
 * human clicks a module. A blank app is a worse failure than a stuck ghost.
 * The host injects the seam; nothing in the bag imports feature code.
 */
async function escapeProgrammatically(g: AttractGhost): Promise<boolean> {
  if (!escapeHatch) return false;
  await escapeHatch();
  await g.sleep(g.jitter(2000, 1200));
  return true;
}

/** Nav buttons for modules the ghost has not been to yet, denylist applied. */
function unvisitedNavButtons(visited: ReadonlySet<string>): HTMLElement[] {
  return visibleAll(NAV_MODULE_SEL).filter((el) => {
    const id = el.getAttribute(NAV_MODULE_ID_ATTR);
    return !!id && !isDeniedModule(id) && !visited.has(id);
  });
}

interface ReadNavigationOption {
  option: GhostNavigationOption;
  element: HTMLElement;
}

/**
 * Read only labels that are genuinely painted in the expanded sidebar. The
 * buttons carry aria-labels while collapsed, but those are accessibility names
 * for a human using assistive tech, not words the on-screen Ghost has looked
 * at. Reading them early is how it used to announce a destination before ever
 * approaching the rail. The label elements stay mounted, transparent, in the
 * rail, so being in the DOM does not count as painted.
 */
export function readNavigationOptions(
  sidebar: HTMLElement
): ReadNavigationOption[] {
  if (sidebar.matches(".collapsed:not(.hover-expanded)")) return [];

  const modules = [
    ...sidebar.querySelectorAll<HTMLElement>(NAV_MODULE_SEL),
  ].flatMap((element) => {
    const id = element.getAttribute(NAV_MODULE_ID_ATTR) ?? "";
    const label =
      element
        .querySelector<HTMLElement>(NAV_MODULE_LABEL_SEL)
        ?.textContent?.trim() ?? "";
    if (!id || !label || isDeniedModule(id)) return [];
    return [{ option: { kind: "module" as const, id, label }, element }];
  });

  const tabs = [...sidebar.querySelectorAll<HTMLElement>(NAV_TAB_SEL)].flatMap(
    (element) => {
      if (element.getAttribute("aria-disabled") === "true") return [];
      const label =
        element
          .querySelector<HTMLElement>(NAV_TAB_LABEL_SEL)
          ?.textContent?.trim() ?? "";
      if (!label) return [];
      const id =
        element.getAttribute("data-sim-tab") ??
        label.toLowerCase().replace(/\s+/g, "-");
      return [{ option: { kind: "tab" as const, id, label }, element }];
    }
  );

  return [...modules, ...tabs];
}

export function chooseNavigationOption(
  ctx: GhostContext,
  options: ReadNavigationOption[]
): ReadNavigationOption | null {
  const requested = plannedStep(ctx);
  if (requested?.targetModuleId) {
    return (
      options.find(
        ({ option }) =>
          option.kind === "module" && option.id === requested.targetModuleId
      ) ?? null
    );
  }
  if (requested?.targetTabId) {
    const requestedTab = requested.targetTabId.toLowerCase();
    return (
      options.find(
        ({ option }) =>
          option.kind === "tab" &&
          (option.id === requestedTab ||
            option.label.toLowerCase().includes(requestedTab))
      ) ?? null
    );
  }

  const excluded = new Set([
    ctx.moduleId,
    "create",
    "browse",
    "library",
    "practice",
    "museum",
  ]);
  const modules = options.filter(
    ({ option }) =>
      option.kind === "module" &&
      !excluded.has(option.id) &&
      !ctx.barrenModules.has(option.id)
  );
  const unvisited = modules.filter(
    ({ option }) => !ctx.visitedModules.has(option.id)
  );
  return ctx.rng.pick(unvisited.length ? unvisited : modules) ?? null;
}

function plannedStep(ctx: GhostContext) {
  const activity = ctx.activities.current;
  return activity?.steps[activity.stepIndex] ?? null;
}

export const EXPLORE_INTENTIONS: Intention[] = [
  {
    id: "what-is-this-button",
    category: "explore",
    // One control, chosen once: the thought names the button the press lands on.
    target: (ctx) =>
      ctx.rng.pick(
        visibleAll(safe("curio")).filter(
          (el) => !ctx.askedAbout.has(encounterKey(el))
        )
      ) ?? null,
    // Every curio used to get "What does X do?". Mandala and Tunnel are
    // different curiosities that happen to share a mechanism, so the line comes
    // from the control rather than the intention — and the FIRST time it meets
    // one it does not pretend to know what it wants from it.
    thought: (ctx, target) =>
      monologueFor("curio", target, ctx, "What does this one do?"),
    reaction: (ctx, target) => reactionFor(target, ctx),
    // Only if there is one it has not already asked about — otherwise the
    // thought lies ("What does X do?" about a button it pressed four times).
    can: (ctx) =>
      has(ctx, "curio") &&
      visibleAll(safe("curio")).some(
        (el) => !ctx.askedAbout.has(encounterKey(el))
      ),
    appeal: () => 0.5,
    perform: async (g, ctx, target) => {
      if (!target || g.halted()) return false;
      noteEncounter(ctx, target);
      await g.moveAndPress(target);
      // Stay where the hand landed and watch what changed. Gliding away to a
      // corner after every press was the "moves out of the way" tell.
      await g.dwell(g.jitter(1600, 1200));
      return true;
    },
  },

  {
    id: "open-viewer",
    category: "explore",
    thought: (ctx) =>
      oneOf(ctx, [
        "Let's see this properly.",
        "I want a bigger look at it.",
        "What's this 3D thing?",
      ]),
    can: (ctx) => has(ctx, "viewer") && !ctx.viewerOpen && ctx.hasSequence,
    appeal: () => 0.6,
    mood: "delighted",
    perform: async (g, ctx) => {
      if (!(await pressKind(g, ctx, "viewer", 3000))) return false;
      // WebGL is the expensive thing at a park on battery: look, then leave.
      await watchKind(g, "stage", g.jitter(4000, 2500), 6000);
      return true;
    },
  },

  {
    id: "overwhelmed",
    category: "explore",
    operation: "perceive",
    /*
     * Pure personality, and now RARE. Austen, watching a tour: "He sure does say
     * that's a lot of buttons pretty often. Let's make it so he doesn't really
     * do that." It was winning because it presses nothing, so it was satisfiable
     * on every screen while the intentions with something to say needed their
     * control to be present. Twice a session, at an appeal that loses to
     * anything with a real motive behind it.
     *
     * Also not always possible: "that's a lot of buttons" in a room with no
     * buttons is a lie, and an always-true `can` means the mind can never report
     * that nothing is satisfiable, which is the signal a trap gives off.
     */
    thought: (ctx) =>
      ctx.rng.pick([
        "…that's a lot of buttons.",
        "Where do I even start with this?",
        "Hm.",
      ]) ?? "Hm.",
    // Early only. "…that is a lot of buttons" from something that has been
    // driving the app fluently for ten minutes is not shy, it is amnesiac —
    // observed at 607s in a 289-decision session.
    can: (ctx) =>
      (ctx.performed.get("overwhelmed") ?? 0) < 2 &&
      ctx.trail.entries().length < 25 &&
      Object.values(ctx.available).filter((count) => count > 0).length > 2,
    appeal: () => 0.08,
    mood: "unsure",
    perform: async (g, ctx) => {
      g.setHover(null);
      const drifts = 2 + ctx.rng.int(3);
      for (let i = 0; i < drifts && !g.halted(); i++) {
        await g.glideTo(
          window.innerWidth * (0.25 + ctx.rng.next() * 0.5),
          window.innerHeight * (0.25 + ctx.rng.next() * 0.5)
        );
        await g.dwell(g.jitter(700, 800));
      }
      return true;
    },
  },

  {
    id: "consider-navigation",
    category: "explore",
    operation: "perceive",
    target: () =>
      visibleAll(NAV_MODULE_SEL).find((el) =>
        el.classList.contains("active")
      ) ??
      visibleAll(NAV_MODULE_SEL)[0] ??
      null,
    thought: "Let's see where I could go.",
    can: (ctx) => ctx.available["nav-module"] > 0,
    appeal: () => 0.5,
    perform: async (g, ctx, target) => {
      if (!target || g.halted()) return false;

      // Crossing this element's `.ghost-hover-boundary` fires the sidebar
      // package's real pointer-enter path. Its 50ms intent delay completes
      // during this deliberate pause, then and only then are labels painted.
      await g.hoverOn(target, g.jitter(700, 500));
      if (g.halted()) return false;
      const expanded = await g.waitFor(
        `${NAV_SIDEBAR_SEL}.hover-expanded, ${NAV_SIDEBAR_SEL}:not(.collapsed)`,
        1600
      );
      if (!expanded.length) return false;

      const options = readNavigationOptions(expanded[0]!);
      const choice = chooseNavigationOption(ctx, options);
      if (!choice) return false;

      const renderedOptions = options.map(({ option }) => option);
      const contextKey = navigationContextKey(ctx);
      const signature = navigationSignature(renderedOptions);
      const readAt = ctx.trail.lastAt();
      const requested = plannedStep(ctx);
      const hasKnownDestination = Boolean(
        requested?.targetModuleId || requested?.targetTabId
      );
      const recognized =
        hasKnownDestination &&
        recognizesNavigation(ctx.navigation, contextKey, signature, readAt);
      const previous = ctx.navigation.familiarityByContext.get(contextKey);

      ctx.navigation.options = renderedOptions;
      ctx.navigation.lastReadAt = readAt;
      ctx.navigation.lastReadWasFamiliar = recognized;
      ctx.navigation.familiarityByContext.set(contextKey, {
        signature,
        reads: (previous?.reads ?? 0) + 1,
        lastReadAt: readAt,
      });
      if (recognized) ctx.navigation.recognizedReads += 1;
      else ctx.navigation.deliberateReads += 1;

      // Look at a few alternatives before settling on the chosen row. The
      // final pause is longer: this is the visible moment where the Ghost has
      // read the menu and made up its mind. A familiar, unchanged rail still
      // has to be physically opened; it simply becomes direct recognition
      // instead of another complete scan.
      const alternatives = options.filter(
        ({ element }) => element !== choice.element
      );
      const looks = recognized
        ? 0
        : Math.min(alternatives.length, 1 + ctx.rng.int(3));
      for (let i = 0; i < looks && !g.halted(); i++) {
        const candidate = ctx.rng.pick(alternatives);
        if (!candidate) break;
        alternatives.splice(alternatives.indexOf(candidate), 1);
        await g.hoverOn(candidate.element, g.jitter(420, 420));
      }
      if (g.halted()) return false;

      await g.hoverOn(
        choice.element,
        recognized ? g.jitter(520, 320) : g.jitter(1000, 700)
      );
      ctx.navigation.choice = choice.option;
      return true;
    },
  },

  {
    id: "go-to-module",
    category: "explore",
    target: (ctx) => {
      const choice = ctx.navigation.choice;
      if (choice?.kind !== "module") return null;
      return (
        visibleAll(NAV_MODULE_SEL).find(
          (el) => el.getAttribute(NAV_MODULE_ID_ATTR) === choice.id
        ) ?? null
      );
    },
    thought: (ctx, target) => {
      const name = ctx.navigation.choice?.label ?? "";
      if (!name) return "Let's see what else is here.";
      const id = target?.getAttribute(NAV_MODULE_ID_ATTR);
      if (id && ctx.visitedModules.has(id))
        return `Back to ${name} for a second.`;
      return monologueFor(
        "nav-module",
        target,
        ctx,
        `I haven't looked at ${name} yet.`
      );
    },
    can: (ctx) =>
      ctx.available["nav-module"] > 0 &&
      ctx.reachableModules.length > 0 &&
      ctx.navigation.choice?.kind === "module",
    // Restlessness is what stops the ghost admiring one screen for the whole
    // jam; an unvisited module is worth more than a re-visit.
    appeal: (ctx) =>
      ((unvisitedNavButtons(ctx.visitedModules).length ? 0.55 : 0.25) +
        restlessness(ctx) * 0.45) *
      settled(ctx),
    perform: async (g, ctx, target) => {
      if (!target || g.halted()) return false;
      await g.moveAndPress(target);
      ctx.navigation.choice = null;
      // Give the module its mount before the next tick senses an empty screen.
      await g.sleep(g.jitter(1800, 1200));
      return true;
    },
  },

  {
    id: "take-in-the-room",
    category: "explore",
    operation: "perceive",
    thought: (ctx) =>
      ctx.moduleId && (ctx.moduleEpisodes.get(ctx.moduleId)?.visits ?? 0) > 1
        ? oneOf(ctx, [
            "Anything new in here?",
            "One more look around.",
            "Did I miss something?",
          ])
        : oneOf(ctx, [
            "Let's have a look.",
            "What is this place?",
            "Hm. What's here?",
          ]),
    can: (ctx) =>
      ctx.activities.current?.id === "visit" &&
      ctx.lastIntentionId === "go-to-module",
    appeal: () => 0.5,
    perform: async (g, ctx) => {
      g.setHover(null);
      await g.glideTo(
        window.innerWidth * (0.35 + ctx.rng.next() * 0.3),
        window.innerHeight * (0.35 + ctx.rng.next() * 0.3)
      );
      await g.dwell(g.jitter(2800, 1800));
      return true;
    },
  },

  {
    id: "change-tab",
    category: "explore",
    target: (ctx) => {
      const choice = ctx.navigation.choice;
      if (choice?.kind !== "tab") return null;
      const tabs = visibleAll(NAV_TAB_SEL).filter(
        (el) =>
          !el.classList.contains("active") &&
          el.getAttribute("aria-disabled") !== "true"
      );
      return (
        tabs.find(
          (el) =>
            el.getAttribute("data-sim-tab") === choice.id ||
            labelOf(el).toLowerCase() === choice.label.toLowerCase()
        ) ?? null
      );
    },
    thought: (ctx, _target) => {
      const name = ctx.navigation.choice?.label ?? "";
      return name
        ? oneOf(ctx, [`Let's look at ${name}.`, `${name}. What's in here?`])
        : oneOf(ctx, ["There's more in here.", "What's behind this tab?"]);
    },
    can: (ctx) => has(ctx, "nav-tab") && ctx.navigation.choice?.kind === "tab",
    appeal: (ctx) => (0.3 + restlessness(ctx) * 0.2) * settled(ctx),
    perform: async (g, ctx, target) => {
      // Sidebar tabs come from @austencloud/sidebar, so they are matched by the
      // package's own class rather than an annotation TKA cannot add.
      if (!target || g.halted()) return false;
      await g.moveAndPress(target);
      ctx.navigation.choice = null;
      await g.sleep(g.jitter(1400, 1000));
      return true;
    },
  },

  {
    id: "dismiss-blocker",
    category: "reset",
    interrupt: true,
    thought: "Not right now, thanks.",
    // Beats everything while a blocker is up, and it has to: an overlay with a
    // backdrop makes every other control fail the press hit-test, so until it
    // is gone the ghost's whole world reads as empty. On a fresh browser
    // profile the create-tutorial prompt is the FIRST thing on screen, which
    // means an un-dismissable blocker is a presenter that spends the entire jam
    // standing in front of a modal saying "let's go back".
    can: (ctx) => has(ctx, "dismiss"),
    appeal: () => 1,
    mood: "unsure",
    perform: async (g, ctx) => {
      if (!(await pressKind(g, ctx, "dismiss", 1500))) return false;
      await g.sleep(g.jitter(900, 600));
      return true;
    },
  },

  {
    id: "let-it-show-me",
    category: "explore",
    thought: (ctx) =>
      oneOf(ctx, [
        "Can I actually walk around in here?",
        "Show me around, then.",
        "Let's see the rest of this place.",
      ]),
    // The way into an immersive module. Very high appeal: a 3D room the ghost is
    // standing still in is the worst-looking moment in the whole tour, and the
    // docent button is the only thing in there it can press. It is also the one
    // beat where the ghost stops driving and lets the module drive — so the dwell
    // is long, because walking a museum IS the demonstration.
    /*
     * `!presenting` is load-bearing, not defensive. Without it the museum is an
     * absorbing state: the docent button is the ONLY annotated control in the
     * room, so once the ghost is in there nothing else is satisfiable, and it
     * re-presses the button while the docent is already walking. A 400-decision
     * simulation spent 96% of the whole session doing exactly that — one room,
     * one button, 382 times, saying "Can I actually walk around in here?" over
     * and over. Nobody would have called that a character.
     */
    /*
     * And ONCE per docent, for the whole session. Handing the room over a
     * second time is not a new experience, it is the same tour replayed — and
     * because the docent button is the only control in an immersive module,
     * nothing else exists to outscore it while the ghost stands there.
     *
     * A 150-session fleet found the trap that earned this: one session spent
     * 7.7 of its 14 minutes in the museum, in five cycles of press-the-docent,
     * stand-still-for-92-seconds, press-it-again. `escape-room` was satisfiable
     * that whole time and simply kept losing the weighted draw to a button with
     * nothing to compete against.
     */
    target: (ctx) =>
      ctx.rng.pick(
        visibleAll(safe("docent")).filter(
          (el) => !ctx.askedAbout.has(encounterKey(el))
        )
      ) ?? null,
    can: (ctx) =>
      !ctx.presenting &&
      visibleAll(safe("docent")).some(
        (el) => !ctx.askedAbout.has(encounterKey(el))
      ),
    appeal: () => 0.95,
    mood: "delighted",
    perform: async (g, ctx, target) => {
      if (!target || g.halted()) return false;
      noteEncounter(ctx, target);
      await g.moveAndPress(target);
      // Get the pointer out of the middle of the scene and let it play.
      await g.glideTo(window.innerWidth * 0.86, window.innerHeight * 0.82);
      await g.dwell(g.jitter(26_000, 16_000));
      return true;
    },
  },

  {
    id: "leave-viewer",
    category: "explore",
    thought: "Right — what else was there?",
    // The viewer drawer covers the sidebar, so `go-to-module` cannot fire while
    // it is open: without this, a viewer with plenty to do inside it would hold
    // the ghost for the whole jam, and the only exit would be escape-room's
    // 45s-stuck gate. Restlessness makes leaving a decision rather than a
    // timeout — it loses to anything interesting for the first minute or so.
    can: (ctx) => ctx.viewerOpen && has(ctx, "close-overlay"),
    appeal: (ctx) => restlessness(ctx) * 0.5,
    perform: async (g, ctx) => {
      if (!(await pressKind(g, ctx, "close-overlay", 1500))) return false;
      await g.sleep(g.jitter(1200, 800));
      return true;
    },
  },

  {
    id: "escape-room",
    category: "reset",
    interrupt: true,
    thought: "Let's go back.",
    // The trap this exists for: an immersive module (the museum, a fullscreen
    // scene) that hides the sidebar. With no nav button on screen the ghost
    // physically cannot press its way out, and every tick after that is it
    // standing there being confused in front of strangers. Gated hard on
    // genuinely stuck — nothing to touch, no way out, and long enough that it
    // is not a mid-load flicker.
    can: (ctx) =>
      // Nothing to press ANYWHERE, not merely no nav: an open viewer covers
      // the sidebar without trapping anything, and backing out of that would
      // be the ghost undoing its own work. A close-overlay control does not
      // count as something to do — it IS this intention's way out.
      Object.entries(ctx.available).every(
        ([kind, count]) =>
          count === 0 ||
          kind === "close-overlay" ||
          // A docent button the ghost has ALREADY handed the room to is not
          // something left to do — it is the thing it just did. Counting it as
          // "there is still something to press" is what sealed the museum: the
          // only control in the room was also the only reason the escape gate
          // could never open.
          (kind === "docent" && (ctx.performed.get("let-it-show-me") ?? 0) > 0)
      ) &&
      ctx.lingerCount === 0 &&
      // A module running its own tour (the museum docent) has nothing left to
      // press BY DESIGN. Escaping it would drag the ghost out of the best thing
      // happening on screen.
      !ctx.presenting &&
      ctx.moduleDwellMs > 45_000,
    appeal: () => 1,
    mood: "bored",
    perform: async (g, ctx) => {
      // Prefer the room's own door. An overlay (the viewer drawer) sits ABOVE
      // the module, so switching modules underneath it leaves the overlay
      // covering the app and the ghost still trapped — observed live: it
      // escaped to create and stayed stuck behind a viewer showing "animation
      // data not available". Pressing the real close button is also the
      // on-brand move: a viewer sees the app being driven.
      if (has(ctx, "close-overlay")) {
        if (await pressKind(g, ctx, "close-overlay", 1500)) {
          await g.sleep(g.jitter(1200, 800));
          return true;
        }
      }
      return escapeProgrammatically(g);
    },
  },

  {
    id: "browse-gallery",
    category: "explore",
    operation: "perceive",
    thought: (ctx) =>
      oneOf(ctx, [
        "I wonder who else has made stuff.",
        "What has everyone else been building?",
      ]),
    can: (ctx) => has(ctx, "gallery-item"),
    appeal: () => 0.4,
    perform: async (g, ctx) => {
      const items = await g.waitFor(safe("gallery-item"), 3000);
      if (!items.length || g.halted()) return false;
      // Looking, not opening — hover a few and move on.
      for (let i = 0; i < 2 + ctx.rng.int(2) && !g.halted(); i++) {
        await g.hoverOn(ctx.rng.pick(items)!, g.jitter(900, 800));
      }
      return true;
    },
  },

  {
    id: "open-someone-elses",
    category: "explore",
    changesPresentation: true,
    thought: (ctx) =>
      oneOf(ctx, [
        "Let's look at this one properly.",
        "Somebody made this. Let's see it move.",
      ]),
    can: (ctx) =>
      has(ctx, "gallery-item") &&
      ctx.budgets.galleryOpens < GALLERY_OPENS_PER_SESSION,
    appeal: () => 0.45,
    mood: "delighted",
    perform: async (g, ctx) => {
      if (!(await browseKind(g, "gallery-item", 3000))) return false;
      ctx.budgets.galleryOpens++;
      await g.sleep(g.jitter(1600, 1000));
      await watchKind(g, "stage", g.jitter(3200, 2000), 4000);
      return true;
    },
  },
];

/**
 * Test seam. The only module-level state left here is the escape hatch, which
 * is a host-injected seam rather than session memory — everything a tour
 * remembers now lives in GhostMemory, so it is seeded and it resets with the
 * mind instead of surviving as a hidden global.
 */
export function __resetExploreSessionState(): void {
  escapeHatch = null;
}
