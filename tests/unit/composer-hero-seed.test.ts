/**
 * Static contract: /composer opens its hero on the baked fixture.
 *
 * `createHeroAct` renders nothing until its first sequence exists, and the
 * first LIVE draw is a cold generation — measured at 14.1 s on the dev server.
 * Seeding the act with FALLBACK_DEMO puts a real 16-count LOOP on screen
 * immediately; the act's own prefetch swaps in the live draw at the next loop
 * boundary. HomeHero has always done this. /composer briefly did not
 * (5d637dc105), and the page sat on "Preparing a live sequence..." for the
 * whole cold roll.
 *
 * If this fails, restore the seed — do not loosen the assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const SEEDED_HOSTS = [
  "src/routes/(public)/composer/_components/ComposerExperience.svelte",
  "src/lib/shared/landing/components/HomeHero.svelte",
];

describe("hero act seeding", () => {
  for (const host of SEEDED_HOSTS) {
    it(`${host} seeds createHeroAct with an opening sequence`, () => {
      const source = readFileSync(path.join(repoRoot, host), "utf-8");
      const call = source.match(/createHeroAct\(([\s\S]*?)\);/);
      expect(call, `${host} does not call createHeroAct`).not.toBeNull();
      expect(call?.[1]).toContain("initialSequence");
      expect(call?.[1]).toContain("FALLBACK_DEMO");
    });
  }
});
