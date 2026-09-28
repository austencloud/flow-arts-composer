import { afterEach, describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import de from "../../../messages/de.json";
import { setLocale } from "../../../src/lib/shared/i18n/i18n.svelte";
import {
  AUTH_NUDGE_TEXTS,
  getAuthPromptContent,
  moduleNudgeTrigger,
  type AuthNudgeTrigger,
} from "../../../src/lib/shared/auth/domain/auth-nudge-trigger";
import {
  authNudgeCopy,
  authPromptCopy,
} from "../../../src/lib/shared/auth/domain/auth-prompt-copy";

const triggers = Object.keys(AUTH_NUDGE_TEXTS) as AuthNudgeTrigger[];

afterEach(async () => {
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

describe("guest prompt translations", () => {
  it("renders the guest feedback gate in German", async () => {
    await setLocale("de");
    expect(authNudgeCopy(moduleNudgeTrigger("feedback"))).toBe(
      "Erstelle ein kostenloses Konto, um diesen Bereich der App zu öffnen."
    );
  });

  it.each(triggers)(
    "resolves %s in English and German without fallback",
    async (trigger) => {
      await setLocale("en");
      expect(authNudgeCopy(trigger)).toBe(AUTH_NUDGE_TEXTS[trigger]);

      await setLocale("de");
      const translated = authNudgeCopy(trigger);
      expect(translated).not.toBe(AUTH_NUDGE_TEXTS[trigger]);
      expect(translated).not.toMatch(/^auth_/);
      expect(Object.values(de)).toContain(translated);
    }
  );

  it.each([...triggers, null])(
    "translates the title and body after %s opens sign-in",
    async (trigger) => {
      for (const mode of ["signup", "signin"] as const) {
        const content = getAuthPromptContent(trigger, mode);
        await setLocale("en");
        for (const source of [content.title, content.body]) {
          expect(Object.values(en)).toContain(authPromptCopy(source));
        }
        await setLocale("de");
        for (const source of [content.title, content.body]) {
          const translated = authPromptCopy(source);
          expect(translated).not.toBe(source);
          expect(translated).not.toMatch(/^auth_/);
          expect(Object.values(de)).toContain(translated);
        }
      }
    }
  );

  it("updates a previously selected prompt when the locale changes", async () => {
    const trigger = moduleNudgeTrigger("feedback");
    const content = getAuthPromptContent(trigger, "signup");
    await setLocale("de");
    const german = [authNudgeCopy(trigger), authPromptCopy(content.title)];
    await setLocale("en");
    expect(authNudgeCopy(trigger)).toBe(AUTH_NUDGE_TEXTS[trigger]);
    expect(authPromptCopy(content.title)).toBe(content.title);
    expect([authNudgeCopy(trigger), authPromptCopy(content.title)]).not.toEqual(
      german
    );
  });
});
