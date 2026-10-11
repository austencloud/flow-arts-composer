/**
 * Static guards on the presenter's safety layers and its annotation contract
 * (spec: 2026-08-04-ghost-mind-design.md §Testing, rows 3, 5, 6).
 *
 * These are grep-shaped on purpose. They protect the two properties that
 * actually keep a laptop safe in front of strangers — default-deny pressing
 * and an unreachable denylist — without rendering 26 modules.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DENIED_MODULES,
  EXTERNALLY_PROVIDED_KINDS,
  isDeniedModule,
  isDeniedPath,
  safe,
  type GhostKind,
} from "#lib/shared/attract/domain/annotations.js";
import {
  EMPTY_WORLD,
  type GhostContext,
} from "#lib/shared/attract/domain/intention.js";
import { createMemory } from "#lib/shared/attract/domain/scoring.js";
import { createRng } from "#lib/shared/attract/services/rng.js";
import { createTrail } from "#lib/shared/attract/services/trail.js";
import { ALL_INTENTIONS } from "#lib/shared/attract/intentions/index.js";

const INTENTIONS_DIR = "src/lib/shared/attract/intentions";

/** Comments explain the banned patterns by name, so match CODE only. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function intentionSources(): { file: string; source: string }[] {
  return readdirSync(INTENTIONS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({
      file: f,
      source: stripComments(readFileSync(join(INTENTIONS_DIR, f), "utf8")),
    }));
}

describe("ghost safety", () => {
  it("has no intention that thinks it can act in an empty world", () => {
    // A `can` that is true against nothing is a lying precondition, and a
    // lying precondition is the single thing that makes the ghost look broken.
    // There is no exception any more: `overwhelmed` used to be one, on the
    // grounds that it presses nothing — but an always-true intention also means
    // the mind can never report "nothing here is satisfiable", which is exactly
    // the signal a trapped ghost gives off.
    const ctx: GhostContext = {
      ...EMPTY_WORLD,
      ...createMemory(
        createRng(1),
        createTrail(() => 0)
      ),
    };

    const optimistic = ALL_INTENTIONS.filter((i) => i.can(ctx)).map(
      (i) => i.id
    );
    expect(optimistic).toEqual([]);
  });

  it("gives every intention a unique id", () => {
    const ids = ALL_INTENTIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every appeal inside 0..1 across a spread of worlds", () => {
    const worlds: Partial<typeof EMPTY_WORLD>[] = [
      {},
      { hasSequence: true, sequenceLength: 1 },
      { hasSequence: true, sequenceLength: 12, isPlaying: true },
      { hasSequence: true, sequenceLength: 40, activeEffectIds: ["fire"] },
    ];
    for (const world of worlds) {
      const ctx: GhostContext = {
        ...EMPTY_WORLD,
        ...world,
        ...createMemory(
          createRng(3),
          createTrail(() => 0)
        ),
      };
      ctx.moduleDwellMs = 600_000; // long past the restlessness ceiling
      for (const intention of ALL_INTENTIONS) {
        const appeal = intention.appeal(ctx);
        expect(
          appeal,
          `${intention.id} appeal out of range: ${appeal}`
        ).toBeGreaterThanOrEqual(0);
        expect(appeal).toBeLessThanOrEqual(1);
      }
    }
  });

  it("refuses the denied routes by module id and by path", () => {
    for (const moduleId of DENIED_MODULES) {
      expect(isDeniedModule(moduleId)).toBe(true);
      expect(isDeniedPath(`/${moduleId}`)).toBe(true);
      expect(isDeniedPath(`/${moduleId}/anything`)).toBe(true);
    }
    expect(isDeniedModule("create")).toBe(false);
    expect(isDeniedPath("/create/construct")).toBe(false);
    // A module whose name merely starts with a denied one is not denied.
    expect(isDeniedPath("/adminsomething")).toBe(false);
  });

  it("presses only through the allowlist — no raw selectors in the bag", () => {
    // Every query in an intention must route through safe()/the two sidebar
    // constants. A bare class or testid selector would bypass default-deny.
    // Allowed: a literal [data-ghost…] selector, or a template that starts
    // from safe(). Anything else is a raw class/testid and bypasses the gate.
    const forbidden = /waitFor\(\s*["'`](?!\[data-ghost|\$\{safe\()/;
    for (const { file, source } of intentionSources()) {
      const offenders = source
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => forbidden.test(line));
      expect(offenders, `${file} queries outside the allowlist`).toEqual([]);
    }
  });

  it("only ever navigates by pressing — no goto/switchModule in the bag", () => {
    for (const { file, source } of intentionSources()) {
      expect(source, `${file} navigates programmatically`).not.toMatch(
        /\bgoto\(|switchModule|location\.(href|assign|replace)/
      );
    }
  });

  it("never moves the URL behind the module system's back", () => {
    // history.back() and goto() change the URL while the module system carries
    // on believing it is elsewhere, and the shell then renders an EMPTY screen
    // until a human clicks a module. Escaping goes through the injected
    // escapeHatch, which performs a real module switch.
    const sources = [
      ...intentionSources(),
      {
        file: "PresenterHost.svelte",
        source: stripComments(
          readFileSync(
            "src/lib/shared/attract/components/PresenterHost.svelte",
            "utf8"
          )
        ),
      },
    ];
    for (const { file, source } of sources) {
      expect(source, `${file} moves the URL directly`).not.toMatch(
        /history\.(back|forward|go|pushState|replaceState)\(|\bgoto\(/
      );
    }
  });

  it("never lets a thought name something the perform did not choose", () => {
    // The bug Austen caught live: "I wonder what Side by Side is" followed by a
    // click on something else, and "I want to slow down" followed by pressing
    // Fast. The thought resolved BEFORE the perform and each sampled the DOM
    // separately — the thought took the first match, the perform a random one.
    // A thought that inspects the DOM must do it through target(), which is
    // resolved once and handed to both.
    // Two shapes are wrong: a thought that queries the DOM itself, and a
    // thought that reads a `target` the intention never declares (so it is
    // always null and the thought silently falls back to its generic line).
    const inspectsDom = /visibleAll\(|querySelector|\btarget\b/;
    const offenders: string[] = [];
    for (const { file, source } of intentionSources()) {
      // Each intention is an object literal opening with `id: "..."`.
      const blocks = source.split(/\n\s{2}\{\n/).slice(1);
      for (const block of blocks) {
        const id = block.match(/id:\s*"([^"]+)"/)?.[1];
        if (!id) continue;
        const thought = block.match(
          /thought:[\s\S]*?\n\s{4}(?=can:|target:|appeal:|mood:|perform:)/
        );
        if (!thought) continue;
        if (inspectsDom.test(thought[0]) && !/\n\s{4}target:/.test(block)) {
          offenders.push(`${file} → ${id}`);
        }
      }
    }
    expect(
      offenders,
      "thoughts that read the DOM without a target() the perform shares"
    ).toEqual([]);
  });

  it("builds allowlist selectors that require both attributes", () => {
    expect(safe("option")).toBe(
      '[data-ghost="safe"][data-ghost-kind="option"]'
    );
  });
});

describe("annotation integrity", () => {
  const svelteFiles: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".svelte")) svelteFiles.push(path);
    }
  })("src/lib");

  it("never annotates a kind without also marking it safe", () => {
    // data-ghost-kind alone is invisible to the presenter, which is a silent
    // no-op rather than an error — this catches the half-done annotation.
    const offenders = svelteFiles.filter((path) => {
      const source = readFileSync(path, "utf8");
      if (!source.includes("data-ghost-kind")) return false;
      return (
        !source.includes('data-ghost="safe"') && !source.includes("data-ghost=")
      );
    });
    expect(offenders).toEqual([]);
  }, 30_000);

  it("puts every data-ghost-linger on an element that is also annotated", () => {
    const offenders = svelteFiles.filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        source.includes("data-ghost-linger") &&
        !source.includes("data-ghost-kind")
      );
    });
    expect(offenders).toEqual([]);
  }, 30_000);

  /**
   * The test the presenter was missing, and the reason five intentions shipped
   * as dead code. Annotation hygiene was guarded; annotation EXISTENCE was not,
   * so a kind no component carried scored zero forever in silence — green
   * typecheck, green suite, an intention that can never fire. It is also the
   * alarm for the reverse case: the day someone drops the `stage`/`play`
   * annotation off AnimatorCanvas, every playback intention goes quiet and
   * nothing else in the codebase would say a word.
   */
  const annotatedKinds = (() => {
    const found = new Set<string>();
    const kinds = new Set(Object.keys(EMPTY_WORLD.available));
    for (const path of svelteFiles) {
      const source = readFileSync(path, "utf8");
      // Two declaration sites, because a kind can be declared one component
      // away from the element that carries it. `data-ghost-kind` is the raw
      // attribute; `ghostKind` is the prop that shared primitives
      // (FilterChipBase, ChipPopoverOption) forward onto it. Scanning only the
      // attribute reported `filter-option` as uncarried the day four hand-rolled
      // popover rows were consolidated onto one primitive — the annotation was
      // intact in the DOM, but its literal now lived in the caller.
      //
      // The value: a quoted literal, or a {…} expression which may be a ternary
      // over literals or a bare identifier (a prop / $derived). Both quote
      // styles: this repo has single-quoted components too, and a
      // double-quote-only scan silently under-reports (it missed the viewer
      // rail's 'practice' until this test flagged the kind as uncarried).
      const spans = [
        ...source.matchAll(
          /(?:data-ghost-kind|ghostKind)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g
        ),
      ];
      if (!spans.length) continue;
      let indirect = false;
      for (const [, dq, sq, expression] of spans) {
        if (dq) found.add(dq);
        if (sq) found.add(sq);
        if (!expression) continue;
        // Backreferenced quote: `["']…["']` lets a string open with " and close
        // with ', so one apostrophe in a comment ("the button's purpose") shifts
        // pairing for the whole file and swallows the real literals.
        const inner = [...expression.matchAll(/(["'])([^"']*)\1/g)].map(
          (m) => m[2]!
        );
        if (inner.length) inner.forEach((k) => found.add(k));
        // `{ghostKind}` / `{ghostKindFor(id)}` — the kind arrives by prop or
        // helper. Fall back to the file's own literals, which is where such a
        // component declares its union.
        else indirect = true;
      }
      if (indirect) {
        for (const [, , literal] of source.matchAll(/(["'])([^"']*)\1/g)) {
          if (kinds.has(literal!)) found.add(literal!);
        }
      }
    }
    return found;
  })();

  it("has at least one annotated element for every kind the bag can act on", () => {
    const missing = (Object.keys(EMPTY_WORLD.available) as GhostKind[])
      .filter((kind) => !EXTERNALLY_PROVIDED_KINDS.includes(kind))
      .filter((kind) => !annotatedKinds.has(kind));
    expect(
      missing,
      "kinds no component carries — every intention gated on one can never fire"
    ).toEqual([]);
  });

  it("has no intention gated on a kind that is not in the vocabulary", () => {
    // The other direction: an intention querying safe("whatever") that the type
    // no longer contains would be a compile error, but a kind left in
    // EMPTY_WORLD after its intentions were deleted is dead weight the coverage
    // test above would then demand annotations for.
    const bag = intentionSources()
      .map((s) => s.source)
      .join("\n");
    // Kinds reach the bag as bare string arguments — safe("option"),
    // has(ctx, "turn"), watchKind(g, "stage", …) — so match every literal and
    // intersect with the vocabulary rather than enumerating the helpers.
    // `[^"]*`, not `+`: an empty `""` in the source (explore.ts has two) cannot
    // match a non-empty body, so its opening quote pairs with the NEXT
    // literal's and every literal after it is read inside-out. That silently
    // truncated this scan at the third file.
    const referenced = new Set(
      [...bag.matchAll(/"([^"]*)"/g)].map((m) => m[1]!)
    );
    const orphans = (Object.keys(EMPTY_WORLD.available) as GhostKind[]).filter(
      (kind) =>
        !referenced.has(kind) && !EXTERNALLY_PROVIDED_KINDS.includes(kind)
    );
    expect(orphans, "kinds in the vocabulary that no intention uses").toEqual(
      []
    );
  });

  it("never annotates a control inside a denied module's feature folder", () => {
    // Layer 1 and layer 2 must not contradict each other: a pressable control
    // annotated inside /admin would be reachable the moment a route slipped.
    const offenders = svelteFiles.filter(
      (path) =>
        /[\\/]features[\\/](admin|feedback)[\\/]/.test(path) &&
        readFileSync(path, "utf8").includes('data-ghost="safe"')
    );
    expect(offenders).toEqual([]);
  });
});
