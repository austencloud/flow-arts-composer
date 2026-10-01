/**
 * Who may pick a paid cosmetic prop.
 *
 * The prop domain knows WHICH props cost money (PREMIUM_COSMETIC_PROP_TYPES in
 * prop-type-display-registry.ts). This module is the only place that decides
 * WHETHER the person at the keyboard may have one, so the answer cannot drift
 * between the picker, the keyboard shortcuts, Arena, avatar generation and
 * voice control.
 *
 * There are two worlds to get right:
 *
 *   1. The Scribe tier is shelved. `__FEATURE_PREMIUM__` is a compile-time
 *      false in every build, dev included, and the premium module it would send
 *      people to is stubbed out. Showing a "Go Premium" button here would send
 *      the user nowhere. So while the tier is off, the props are a preview:
 *      visible and usable on a dev machine or to an admin, invisible to
 *      everyone else. Nobody is offered a checkout that does not exist.
 *
 *   2. Once the tier ships, the ordinary subscription gate takes over and this
 *      module stops making its own judgement.
 *
 * Play-earned unlocking is a separate axis and does not touch any of this.
 * Paid cosmetics are not in UNLOCKABLE_POOL, so `isPropUnlocked()` neither
 * grants nor denies them.
 */

import { loadedAuthState } from "$lib/shared/auth/state/loaded-auth-state.svelte";
import { isPremiumCosmeticProp } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import { checkPremiumGate } from "../services/premium-gate-checker";
import { CAPABILITY_NUDGES } from "./capability-nudges";
import type { NudgeConfig, PremiumGateResult } from "../services/types";
import type { CapabilityFeatureId } from "$lib/shared/auth/domain/models/feature-flag";

/** The one capability paid cosmetics run on. Do not add a second. */
export const PREMIUM_COSMETIC_CAPABILITY: CapabilityFeatureId =
  "capability:props:premium-cosmetics";

/** The nudge shown when a paid prop is denied. */
export const PREMIUM_COSMETIC_NUDGE: NudgeConfig =
  CAPABILITY_NUDGES[PREMIUM_COSMETIC_CAPABILITY]!;

/**
 * What the surrounding app looks like when the access question is asked.
 * Passed in rather than read here so the decision itself stays testable.
 */
export interface PremiumCosmeticEnvironment {
  /** `__FEATURE_PREMIUM__` — whether the paid tier is actually shippable. */
  premiumTierShipped: boolean;
  /** A development build. */
  isDev: boolean;
  /** The signed-in user is an admin. */
  isAdminUser: boolean;
  /** The real subscription gate. Only consulted once the tier ships. */
  checkGate: (capability: CapabilityFeatureId) => PremiumGateResult;
}

/**
 * The access decision, with nothing read from the environment.
 *
 * While the tier is shelved, a denial comes back with no nudge attached: there
 * is nothing to upsell to, and the caller is expected to have hidden the prop
 * entirely rather than show a dead end.
 */
export function decidePremiumCosmeticAccess(
  env: PremiumCosmeticEnvironment
): PremiumGateResult {
  if (!env.premiumTierShipped) {
    if (env.isDev || env.isAdminUser) return { allowed: true };
    return { allowed: false, reason: "capability_disabled" };
  }

  return env.checkGate(PREMIUM_COSMETIC_CAPABILITY);
}

function readEnvironment(): PremiumCosmeticEnvironment {
  return {
    premiumTierShipped:
      typeof __FEATURE_PREMIUM__ !== "undefined" && __FEATURE_PREMIUM__,
    isDev: import.meta.env.DEV,
    isAdminUser: loadedAuthState.isAdmin,
    checkGate: checkPremiumGate,
  };
}

/**
 * Whether the current user may select a paid cosmetic prop right now.
 * Carries the nudge when the paid tier is live and the answer is no.
 */
export function checkPremiumCosmeticAccess(): PremiumGateResult {
  return decidePremiumCosmeticAccess(readEnvironment());
}

/**
 * Whether a paid cosmetic tile should appear at all.
 *
 * While the tier is shelved this is the same question as access: if you cannot
 * have it and cannot buy it, showing it is just a locked door. Once the tier
 * ships the tile is always visible, because the whole point of a nudge is that
 * you can see what you are missing.
 */
export function isPremiumCosmeticVisible(): boolean {
  const env = readEnvironment();
  if (env.premiumTierShipped) return true;
  return decidePremiumCosmeticAccess(env).allowed;
}

/**
 * Strip paid cosmetics out of a raw prop list unless the user may use them.
 *
 * This is what every ungated enumerator calls — keyboard cycling, shuffle,
 * Arena matchups, avatar generation. Adding a prop to the enum adds it to
 * `getAllPropTypes()`, and without this those surfaces would hand it out for
 * free.
 */
export function filterPremiumCosmeticProps<T extends string>(
  props: readonly T[]
): T[] {
  return filterPremiumCosmeticPropsForAccess(
    props,
    checkPremiumCosmeticAccess().allowed
  );
}

/**
 * Pure form of the raw-list filter. Keep the access decision outside this
 * function so both branches can be pinned without depending on auth state or
 * build flags.
 */
export function filterPremiumCosmeticPropsForAccess<T extends string>(
  props: readonly T[],
  premiumAllowed: boolean
): T[] {
  if (premiumAllowed) return [...props];
  return props.filter((prop) => !isPremiumCosmeticProp(prop));
}

/**
 * What a click on a prop tile should do.
 *
 * `select` is the only outcome that may reach the caller's selection callback.
 */
export type PropTileClickRoute = "select" | "premium-nudge" | "earn-tip";

/**
 * Route a prop-tile click.
 *
 * The ordering is the whole point and is easy to break by accident:
 *
 *   Paid cosmetics are decided by the premium answer alone, BEFORE the
 *   play-earned unlock state is consulted. They are not in UNLOCKABLE_POOL, so
 *   asking `isPropUnlocked` first would call them locked and — the day
 *   play-earned locking is switched back on — leave them permanently
 *   unclickable behind an "Earn by creating" tip for something that is only
 *   ever for sale.
 */
export function routePropTileClick(input: {
  isPremiumCosmetic: boolean;
  premiumAllowed: boolean;
  isUnlocked: boolean;
}): PropTileClickRoute {
  if (input.isPremiumCosmetic) {
    return input.premiumAllowed ? "select" : "premium-nudge";
  }
  return input.isUnlocked ? "select" : "earn-tip";
}
