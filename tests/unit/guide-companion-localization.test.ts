// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
import { guideTurnDisplayWord } from "../../src/routes/(public)/guide/level-1/_data/guide-turn-display-word";

const companionSource = readFileSync(
  resolve(
    "src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte"
  ),
  "utf8"
);

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

describe("Guide companion German display", () => {
  it("passes localized descriptive titles to the player without changing canonical words", async () => {
    const canonical = "Prospin with a turn";
    expect(companionSource).toMatch(
      /<InlineAnimationPlayer\s+[\s\S]*?\{sequence\}\s+displayWord=\{sequence\.word \? guideTurnDisplayWord\(sequence\.word\) : null\}/
    );
    await setLocale("de");
    expect(guideTurnDisplayWord(canonical)).toBe("Prospin mit einer Drehung");
    expect(canonical).toBe("Prospin with a turn");
    expect(t("guide_companion_dialog")).toBe("Animationsbegleiter");
    expect(t("guide_companion_close")).toBe("Animation schließen");
    expect(t("guide_companion_show_controls")).toBe(
      "Animationssteuerung anzeigen"
    );
    expect(t("guide_companion_hide_controls")).toBe(
      "Animationssteuerung ausblenden"
    );
  });

  it("makes quarter and third pose announcements grammatical", async () => {
    await setLocale("de");
    for (const [key, expected] of [
      [
        "guide_l2_aria_quarter",
        "Staff-Position nach einem Viertel der Bewegung",
      ],
      [
        "guide_l2_aria_three_quarters",
        "Staff-Position nach drei Vierteln der Bewegung",
      ],
      [
        "guide_l2_aria_one_third",
        "Staff-Position nach dem ersten Drittel der Bewegung",
      ],
      [
        "guide_l2_aria_two_thirds",
        "Staff-Position nach dem zweiten Drittel der Bewegung",
      ],
      ["guide_l2_aria_halfway", "Staff-Position nach der Hälfte der Bewegung"],
    ] as const) {
      expect(
        t("guide_l2_aria_pose", {
          fraction: t(key),
          motion: "Dash",
          where: "von Süden nach Norden",
        })
      ).toContain(expected);
    }
  });
});
