/** The three settings a typed word may not be able to hold. */
export interface SpellRelaxableSettings {
  handRelationship?: string | null;
  propRelationship?: string | null;
  matchHandTurns?: boolean | null;
}

/** What one retry gives up, named by the setting the person sees. */
export type SpellRelaxation = "hands" | "props" | "handsAndProps" | "matchHandTurns";

export interface SpellRelaxedAttempt {
  relaxed: SpellRelaxation;
  overrides: {
    handRelationship?: "free";
    propRelationship?: "free";
    matchHandTurns?: false;
  };
}

const isPinned = (value: string | null | undefined): boolean =>
  value != null && value !== "free";

/** True when the Hands, Props or match-hand-turns setting restricts generation. */
export function spellSettingsConstrain(
  settings: SpellRelaxableSettings | undefined
): boolean {
  if (!settings) return false;
  return (
    isPinned(settings.handRelationship) ||
    isPinned(settings.propRelationship) ||
    settings.matchHandTurns === true
  );
}

/**
 * A word fixes each letter's hand timing and direction, so many words cannot
 * hold a Hands or Props setting. This lists the retries to make, in order,
 * when generation with the settings as chosen fails:
 * 1. Hands free, with Props and match-hand-turns kept (only when Hands is set).
 * 2. Hands and Props free, match-hand-turns off (only when Props or match is
 *    also set, since otherwise step 1 already gave up everything).
 * Empty when nothing is restricted. The saved config is never changed.
 */
export function planSpellRelaxations(
  settings: SpellRelaxableSettings | undefined
): SpellRelaxedAttempt[] {
  if (!spellSettingsConstrain(settings)) return [];
  const handPinned = isPinned(settings?.handRelationship);
  const propPinned = isPinned(settings?.propRelationship);
  const matchOn = settings?.matchHandTurns === true;

  const attempts: SpellRelaxedAttempt[] = [];
  if (handPinned) {
    attempts.push({
      relaxed: "hands",
      overrides: { handRelationship: "free" },
    });
  }
  if (propPinned || matchOn) {
    attempts.push({
      relaxed:
        handPinned && propPinned
          ? "handsAndProps"
          : propPinned
            ? "props"
            : handPinned
              ? "hands"
              : "matchHandTurns",
      overrides: {
        handRelationship: "free",
        propRelationship: "free",
        matchHandTurns: false,
      },
    });
  }
  return attempts;
}
