# Film Director Directive Language (Schema v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `/test/film-director` schema so constraint intent ("every performer a different prop", "LED on performer 3 only", "close-up on performer 2, then orbit 90° CCW") is written into the film document and compiled to concrete picks by a seeded deterministic resolver — never resolved privately by the translating agent.

**Architecture:** A directive expression layer (`literal | pick any/distinct | oneOf | not | sameAs`) is added to every speakable axis, resolved by a pure constraint resolver drawing from per-(shot, axis) deterministic random streams derived from a film-level seed. A camera cinematography compiler turns framing grammar + named moves into the existing keyframe format. An adversarial corpus of (utterance, JSON, expected outcome) fixtures runs as unit tests. Spec: `docs/superpowers/specs/2026-08-23-film-director-directive-language-design.md`.

**Tech Stack:** TypeScript, Zod v4, Vitest, existing `mulberry32`/`hashString` PRNG (`src/lib/shared/3d/procedural-engine/generation/seed-generator.ts`), existing `computeFramingShot` camera math.

**Ground rules for the executor:**
- Work on `main` in `E:/tka-platform`. Do NOT create a branch or worktree.
- Commit with explicit pathspec only: `git add <paths> && git commit -m "..." -- <paths>` (shared index; see `.claude/rules/commit-only-your-own-changes.md`).
- Run tests with the repo's exclusions: append `--exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"` to every `pnpm exec vitest run`.
- After EVERY task's final step, re-run the full film-director suite and keep it green:
  `pnpm exec vitest run tests/unit/film-director tests/unit/3d/environment-transition-compositor.test.ts tests/unit/3d/environment-transition.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`

---

## File structure

| File | Responsibility |
|---|---|
| Create `src/routes/test/film-director/_lib/directives.ts` | Directive expression types, Zod schema factory, normalization to canonical form |
| Create `src/routes/test/film-director/_lib/directive-random.ts` | Film seed resolution, per-(shot, axis) deterministic streams, seeded shuffle/pick |
| Create `src/routes/test/film-director/_lib/resolve-directives.ts` | The cast-axis constraint resolver (literals → picks → sameAs, precise errors) |
| Create `src/routes/test/film-director/_lib/camera-language.ts` | Framing grammar (subject/shotSize/angle/position) + move list → keyframes |
| Modify `src/routes/test/film-director/_lib/film-director-schema.ts` | v2: version union, `seed`, cast block, directive-capable fields, camera grammar fields, exported axis list |
| Modify `src/routes/test/film-director/_lib/resolve-film-director-spec.ts` | Wire directive resolution + camera language into shot resolution |
| Modify `src/routes/test/film-director/_films/sky-is-the-limit.ts` | Migrate to `version: 2` |
| Create `docs/reference/film-director-capability-matrix.md` | One row per axis: grammar, source-of-truth path, rejection behavior |
| Create `tests/unit/film-director/directives.test.ts` | Normalization + schema factory |
| Create `tests/unit/film-director/directive-random.test.ts` | Determinism, axis-salt isolation |
| Create `tests/unit/film-director/resolve-directives.test.ts` | Constraint semantics + every rejection path |
| Create `tests/unit/film-director/camera-language.test.ts` | Framing math + move compilation |
| Create `tests/unit/film-director/capability-matrix.test.ts` | Doc/schema lockstep |
| Create `tests/unit/film-director/directive-corpus/` (`_types.ts`, `_helpers.ts`, `distribution.ts`, `pin-exclusion.ts`, `unsatisfiable.ts`, `nonexistent.ts`, `camera.ts`, `boundary.ts`, `unknown-axis.ts`, `corpus-runner.test.ts`) | Adversarial corpus fixtures + runner |

---

### Task 1: Directive expressions module

**Files:**
- Create: `src/routes/test/film-director/_lib/directives.ts`
- Test: `tests/unit/film-director/directives.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/film-director/directives.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  directiveSchema,
  normalizeDirective,
} from "../../../src/routes/test/film-director/_lib/directives";

const propValue = z.enum(["staff", "fan", "club"]);
const schema = directiveSchema(propValue);

describe("directiveSchema", () => {
  it("accepts a literal", () => {
    expect(schema.parse("staff")).toBe("staff");
  });

  it("accepts every directive form", () => {
    expect(schema.parse({ pick: "any" })).toEqual({ pick: "any" });
    expect(schema.parse({ pick: "distinct", from: ["staff", "fan"] })).toEqual({
      pick: "distinct",
      from: ["staff", "fan"],
    });
    expect(schema.parse({ oneOf: ["fan", "club"] })).toEqual({
      oneOf: ["fan", "club"],
    });
    expect(schema.parse({ not: "staff" })).toEqual({ not: "staff" });
    expect(schema.parse({ sameAs: "performer-2" })).toEqual({
      sameAs: "performer-2",
    });
  });

  it("rejects unknown literal values and unknown keys", () => {
    expect(() => schema.parse("chainsaw")).toThrow();
    expect(() => schema.parse({ pick: "any", extra: true })).toThrow();
    expect(() => schema.parse({ oneOf: [] })).toThrow();
  });
});

describe("normalizeDirective", () => {
  it("normalizes a literal", () => {
    expect(normalizeDirective("staff")).toEqual({ kind: "literal", literal: "staff" });
  });

  it("normalizes oneOf to a constrained pick", () => {
    expect(normalizeDirective({ oneOf: ["fan", "club"] })).toEqual({
      kind: "pick",
      distinct: false,
      pool: ["fan", "club"],
      exclude: [],
    });
  });

  it("normalizes not with and without a pool", () => {
    expect(normalizeDirective({ not: "staff" })).toEqual({
      kind: "pick",
      distinct: false,
      pool: null,
      exclude: ["staff"],
    });
    expect(normalizeDirective({ not: ["staff"], from: ["staff", "fan"] })).toEqual({
      kind: "pick",
      distinct: false,
      pool: ["staff", "fan"],
      exclude: ["staff"],
    });
  });

  it("normalizes pick any/distinct and sameAs", () => {
    expect(normalizeDirective({ pick: "distinct" })).toEqual({
      kind: "pick",
      distinct: true,
      pool: null,
      exclude: [],
    });
    expect(normalizeDirective({ sameAs: "performer-1" })).toEqual({
      kind: "sameAs",
      sameAs: "performer-1",
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/film-director/directives.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: FAIL — cannot resolve `../_lib/directives`.

- [x] **Step 3: Write the implementation**

```ts
// src/routes/test/film-director/_lib/directives.ts
import { z } from "zod";

/**
 * A directive-capable value: either the concrete value itself, or an
 * expression the resolver compiles into one. This is the written form of
 * constraint intent — "different prop each", "anything but LED" — so the
 * document, not the translating agent, carries the meaning.
 */
export type DirectiveExpression<T> =
  | { pick: "any" | "distinct"; from?: readonly T[] }
  | { oneOf: readonly T[] }
  | { not: T | readonly T[]; from?: readonly T[] }
  | { sameAs: string };

export type DirectiveValue<T> = T | DirectiveExpression<T>;

export interface NormalizedDirective<T> {
  kind: "literal" | "pick" | "sameAs";
  literal?: T;
  distinct?: boolean;
  /** Allowed candidates; null means "the axis's full catalog". */
  pool?: readonly T[] | null;
  exclude?: readonly T[];
  sameAs?: string;
}

export function directiveSchema<S extends z.ZodTypeAny>(value: S) {
  return z.union([
    value,
    z
      .object({
        pick: z.enum(["any", "distinct"]),
        from: z.array(value).min(1).optional(),
      })
      .strict(),
    z.object({ oneOf: z.array(value).min(1) }).strict(),
    z
      .object({
        not: z.union([value, z.array(value).min(1)]),
        from: z.array(value).min(1).optional(),
      })
      .strict(),
    z.object({ sameAs: z.string().min(1) }).strict(),
  ]);
}

export function isDirectiveExpression<T>(
  value: DirectiveValue<T>
): value is DirectiveExpression<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("pick" in value || "oneOf" in value || "not" in value || "sameAs" in value)
  );
}

export function normalizeDirective<T>(
  value: DirectiveValue<T>
): NormalizedDirective<T> {
  if (!isDirectiveExpression(value)) {
    return { kind: "literal", literal: value };
  }
  if ("sameAs" in value) return { kind: "sameAs", sameAs: value.sameAs };
  if ("oneOf" in value) {
    return { kind: "pick", distinct: false, pool: [...value.oneOf], exclude: [] };
  }
  if ("not" in value) {
    const exclude = Array.isArray(value.not) ? [...value.not] : [value.not];
    return {
      kind: "pick",
      distinct: false,
      pool: value.from ? [...value.from] : null,
      exclude,
    };
  }
  return {
    kind: "pick",
    distinct: value.pick === "distinct",
    pool: value.from ? [...value.from] : null,
    exclude: [],
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/film-director/directives.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (3 + 4 tests).

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/directives.ts tests/unit/film-director/directives.test.ts
git commit -m "feat(film-director): directive expression types and schema factory" -- src/routes/test/film-director/_lib/directives.ts tests/unit/film-director/directives.test.ts
```

---

### Task 2: Seeded deterministic streams

**Files:**
- Create: `src/routes/test/film-director/_lib/directive-random.ts`
- Test: `tests/unit/film-director/directive-random.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/film-director/directive-random.test.ts
import { describe, expect, it } from "vitest";

import {
  createAxisStream,
  resolveFilmSeed,
  seededPick,
  seededShuffle,
} from "../../../src/routes/test/film-director/_lib/directive-random";

describe("resolveFilmSeed", () => {
  it("derives a stable base from the film id when none is given", () => {
    expect(resolveFilmSeed("my-film")).toEqual(resolveFilmSeed("my-film"));
    expect(resolveFilmSeed("my-film").base).not.toBe(
      resolveFilmSeed("other-film").base
    );
  });

  it("honors an explicit base and axis salts", () => {
    const seed = resolveFilmSeed("my-film", { base: 7, axes: { prop: 2 } });
    expect(seed.base).toBe(7);
    expect(seed.axes.prop).toBe(2);
  });
});

describe("createAxisStream", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("is deterministic per (seed, shot, axis)", () => {
    const seed = resolveFilmSeed("my-film");
    const one = seededShuffle(items, createAxisStream(seed, "shot-1", "prop"));
    const two = seededShuffle(items, createAxisStream(seed, "shot-1", "prop"));
    expect(one).toEqual(two);
  });

  it("bumping one axis salt changes only that axis's stream", () => {
    const before = resolveFilmSeed("my-film");
    const after = resolveFilmSeed("my-film", { axes: { prop: 1 } });
    expect(
      seededShuffle(items, createAxisStream(before, "shot-1", "avatarId"))
    ).toEqual(seededShuffle(items, createAxisStream(after, "shot-1", "avatarId")));
    expect(
      seededShuffle(items, createAxisStream(before, "shot-1", "prop"))
    ).not.toEqual(seededShuffle(items, createAxisStream(after, "shot-1", "prop")));
  });

  it("different shots draw different streams", () => {
    const seed = resolveFilmSeed("my-film");
    expect(
      seededShuffle(items, createAxisStream(seed, "shot-1", "prop"))
    ).not.toEqual(seededShuffle(items, createAxisStream(seed, "shot-2", "prop")));
  });
});

describe("seededShuffle / seededPick", () => {
  it("shuffle returns a permutation without mutating the input", () => {
    const items = ["a", "b", "c", "d"];
    const stream = createAxisStream(resolveFilmSeed("f"), "s", "prop");
    const shuffled = seededShuffle(items, stream);
    expect(items).toEqual(["a", "b", "c", "d"]);
    expect([...shuffled].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("pick returns a member", () => {
    const stream = createAxisStream(resolveFilmSeed("f"), "s", "prop");
    expect(["x", "y", "z"]).toContain(seededPick(["x", "y", "z"], stream));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/film-director/directive-random.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

```ts
// src/routes/test/film-director/_lib/directive-random.ts
import {
  hashString,
  mulberry32,
} from "$lib/shared/3d/procedural-engine/generation/seed-generator";

export interface FilmSeed {
  base: number;
  /** Per-axis reroll salts — bumping one shuffles only that axis. */
  axes: Record<string, number>;
}

export interface FilmSeedInput {
  base?: number;
  axes?: Record<string, number>;
}

export function resolveFilmSeed(filmId: string, input?: FilmSeedInput): FilmSeed {
  return {
    base: input?.base ?? hashString(filmId),
    axes: { ...(input?.axes ?? {}) },
  };
}

export function createAxisStream(
  seed: FilmSeed,
  shotId: string,
  axis: string
): () => number {
  const salt = seed.axes[axis] ?? 0;
  return mulberry32(hashString(`${seed.base}:${salt}:${shotId}:${axis}`));
}

export function seededShuffle<T>(
  items: readonly T[],
  random: () => number
): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export function seededPick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/film-director/directive-random.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/directive-random.ts tests/unit/film-director/directive-random.test.ts
git commit -m "feat(film-director): seeded per-axis deterministic streams" -- src/routes/test/film-director/_lib/directive-random.ts tests/unit/film-director/directive-random.test.ts
```

---

### Task 3: Cast-axis constraint resolver

**Files:**
- Create: `src/routes/test/film-director/_lib/resolve-directives.ts`
- Test: `tests/unit/film-director/resolve-directives.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/film-director/resolve-directives.test.ts
import { describe, expect, it } from "vitest";

import {
  createAxisStream,
  resolveFilmSeed,
} from "../../../src/routes/test/film-director/_lib/directive-random";
import { resolveCastAxis } from "../../../src/routes/test/film-director/_lib/resolve-directives";

const CATALOG = ["staff", "fan", "club", "sword", "torch", "buugeng"] as const;

function axis(
  values: Parameters<typeof resolveCastAxis<string>>[0]["values"],
  overrides: Partial<Parameters<typeof resolveCastAxis<string>>[0]> = {}
) {
  const ids = values.map((_, index) => `performer-${index + 1}`);
  return resolveCastAxis<string>({
    axis: "prop",
    shotId: "shot-1",
    performerIds: ids,
    values,
    catalog: [...CATALOG],
    random: createAxisStream(resolveFilmSeed("test-film"), "shot-1", "prop"),
    ...overrides,
  });
}

describe("resolveCastAxis", () => {
  it("passes literals through untouched", () => {
    expect(axis(["staff", "fan"])).toEqual(["staff", "fan"]);
  });

  it("resolves pick:any from the catalog deterministically", () => {
    const first = axis([{ pick: "any" }, { pick: "any" }]);
    const second = axis([{ pick: "any" }, { pick: "any" }]);
    expect(first).toEqual(second);
    for (const value of first) expect(CATALOG).toContain(value);
  });

  it("distinct yields pairwise different values and routes around pins", () => {
    const resolved = axis([
      "staff",
      { pick: "distinct" },
      { pick: "distinct" },
      { pick: "distinct" },
    ]);
    expect(new Set(resolved).size).toBe(4);
    expect(resolved[0]).toBe("staff");
    expect(resolved.slice(1)).not.toContain("staff");
  });

  it("not excludes; oneOf restricts", () => {
    const resolved = axis([{ not: "staff" }, { oneOf: ["fan", "club"] }]);
    expect(resolved[0]).not.toBe("staff");
    expect(["fan", "club"]).toContain(resolved[1]);
  });

  it("sameAs copies a resolved pick, even from a directive", () => {
    const resolved = axis([{ pick: "any" }, { sameAs: "performer-1" }]);
    expect(resolved[1]).toBe(resolved[0]);
  });

  it("rejects distinct demands larger than the pool, with counts", () => {
    expect(() =>
      axis([
        { pick: "distinct", from: ["staff", "fan"] },
        { pick: "distinct", from: ["staff", "fan"] },
        { pick: "distinct", from: ["staff", "fan"] },
      ])
    ).toThrow(/distinct/i);
  });

  it("rejects excluding everything", () => {
    expect(() => axis([{ not: [...CATALOG] }])).toThrow(/exclud/i);
  });

  it("rejects sameAs cycles and missing references", () => {
    expect(() =>
      axis([{ sameAs: "performer-2" }, { sameAs: "performer-1" }])
    ).toThrow(/cycle/i);
    expect(() => axis([{ sameAs: "performer-9" }])).toThrow(/performer-9/);
  });

  it("rejects pool values outside the catalog", () => {
    expect(() => axis([{ oneOf: ["chainsaw"] }])).toThrow(/chainsaw/);
  });

  it("rejects open picks on axes with no catalog", () => {
    expect(() => axis([{ pick: "any" }], { catalog: null })).toThrow(/from/i);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/film-director/resolve-directives.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

```ts
// src/routes/test/film-director/_lib/resolve-directives.ts
import {
  normalizeDirective,
  type DirectiveValue,
  type NormalizedDirective,
} from "./directives";
import { seededShuffle } from "./directive-random";

export interface CastAxisInput<T> {
  axis: string;
  shotId: string;
  performerIds: readonly string[];
  /** One effective directive per performer (precedence already applied). */
  values: readonly DirectiveValue<T>[];
  /** Full legal values for the axis, or null when the axis is unbounded. */
  catalog: readonly T[] | null;
  random: () => number;
}

/**
 * Compiles one axis's directives into concrete values. Order matters for
 * determinism: literals first (they count as taken for distinct), then
 * constrained picks in performer order drawing from one seeded shuffle,
 * then sameAs copies last so they can reference picked values.
 */
export function resolveCastAxis<T>(input: CastAxisInput<T>): T[] {
  const { axis, shotId, performerIds, values, catalog, random } = input;
  const where = `Shot "${shotId}", axis "${axis}"`;
  const normalized = values.map((value) => normalizeDirective(value));
  const resolved = new Array<T | undefined>(values.length);
  const taken = new Set<T>();

  normalized.forEach((directive, index) => {
    if (directive.kind !== "literal") return;
    const literal = directive.literal as T;
    assertInCatalog(literal, catalog, where);
    resolved[index] = literal;
    taken.add(literal);
  });

  const deck = catalog ? seededShuffle(catalog, random) : null;
  let cursor = 0;
  const draw = (pool: readonly T[], exclude: ReadonlySet<T>): T | undefined => {
    const poolSet = new Set(pool);
    if (deck && pool === catalog) {
      for (let step = 0; step < deck.length; step += 1) {
        const candidate = deck[(cursor + step) % deck.length]!;
        if (!exclude.has(candidate)) {
          cursor = (cursor + step + 1) % deck.length;
          return candidate;
        }
      }
      return undefined;
    }
    const shuffled = seededShuffle([...poolSet], random);
    return shuffled.find((candidate) => !exclude.has(candidate));
  };

  normalized.forEach((directive, index) => {
    if (directive.kind !== "pick") return;
    const pool = resolvePool(directive, catalog, where);
    const exclude = new Set<T>(directive.exclude as readonly T[]);
    for (const value of exclude) assertInCatalog(value, catalog, where);
    for (const value of pool) assertInCatalog(value, catalog, where);
    if (directive.distinct) for (const value of taken) exclude.add(value);

    const candidates = pool.filter((value) => !exclude.has(value));
    if (candidates.length === 0) {
      if (directive.distinct) {
        throw new Error(
          `${where}: distinct values were requested for ${performerIds.length} performers but the allowed pool has only ${pool.length} (${pool.join(", ")}).`
        );
      }
      throw new Error(
        `${where}: the directive for "${performerIds[index]}" excludes every allowed value.`
      );
    }
    const pick =
      pool === catalog ? draw(pool, exclude) : seededShuffle(candidates, random)[0];
    if (pick === undefined) {
      throw new Error(
        `${where}: distinct values were requested for ${performerIds.length} performers but the catalog has only ${catalog?.length ?? 0}.`
      );
    }
    resolved[index] = pick;
    if (directive.distinct) taken.add(pick);
  });

  resolveSameAs(normalized, resolved, performerIds, where);
  return resolved as T[];
}

function resolvePool<T>(
  directive: NormalizedDirective<T>,
  catalog: readonly T[] | null,
  where: string
): readonly T[] {
  if (directive.pool) return directive.pool;
  if (!catalog) {
    throw new Error(
      `${where}: this axis has no finite catalog — provide "from" with explicit values.`
    );
  }
  return catalog;
}

function assertInCatalog<T>(
  value: T,
  catalog: readonly T[] | null,
  where: string
): void {
  if (catalog && !catalog.includes(value)) {
    throw new Error(
      `${where}: "${String(value)}" is not in the deployed catalog for this axis.`
    );
  }
}

function resolveSameAs<T>(
  normalized: readonly NormalizedDirective<T>[],
  resolved: (T | undefined)[],
  performerIds: readonly string[],
  where: string
): void {
  const pending = normalized
    .map((directive, index) => ({ directive, index }))
    .filter(({ directive }) => directive.kind === "sameAs");

  let remaining = pending.length;
  while (remaining > 0) {
    let progressed = false;
    for (const entry of pending) {
      if (resolved[entry.index] !== undefined) continue;
      const source = entry.directive.sameAs!;
      const sourceIndex = performerIds.indexOf(source);
      if (sourceIndex === -1) {
        throw new Error(
          `${where}: sameAs references "${source}", which is not in this cast.`
        );
      }
      const value = resolved[sourceIndex];
      if (value === undefined) continue;
      resolved[entry.index] = value;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) {
      const stuck = pending
        .filter((entry) => resolved[entry.index] === undefined)
        .map((entry) => performerIds[entry.index])
        .join(", ");
      throw new Error(`${where}: sameAs forms a cycle involving ${stuck}.`);
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/film-director/resolve-directives.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (10 tests). If the distinct-around-pins test flakes on pool exhaustion semantics, the bug is in `draw`'s wraparound — fix there, not in the test.

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/resolve-directives.ts tests/unit/film-director/resolve-directives.test.ts
git commit -m "feat(film-director): cast-axis constraint resolver" -- src/routes/test/film-director/_lib/resolve-directives.ts tests/unit/film-director/resolve-directives.test.ts
```

---

### Task 4: Schema v2 — cast block, seed, directive-capable fields

**Files:**
- Modify: `src/routes/test/film-director/_lib/film-director-schema.ts`
- Test: extend `tests/unit/film-director/film-director-schema.test.ts`

- [x] **Step 1: Write the failing tests** (append to the existing describe block in `film-director-schema.test.ts`)

```ts
import { FILM_DIRECTOR_DIRECTIVE_AXES } from "../../../src/routes/test/film-director/_lib/film-director-schema";

it("accepts version 2 with seed, cast defaults, and directives", () => {
  const parsed = FilmDirectorInputSchema.parse({
    version: 2,
    id: "v2-film",
    title: "V2",
    seed: { base: 7, axes: { prop: 1 } },
    shots: [
      {
        id: "s1",
        title: "S1",
        performance: {
          cast: {
            count: 8,
            defaults: { prop: { pick: "distinct" }, effect: "fire" },
            performers: [{ id: "performer-3", effect: "led" }],
          },
        },
      },
    ],
  });
  expect(parsed.version).toBe(2);
});

it("still accepts version 1 documents unchanged", () => {
  const parsed = FilmDirectorInputSchema.parse({
    version: 1,
    id: "v1-film",
    title: "V1",
    shots: [{ id: "s1", title: "S1" }],
  });
  expect(parsed.version).toBe(1);
});

it("rejects both a cast block and a bare performers array", () => {
  expect(() =>
    FilmDirectorInputSchema.parse({
      version: 2,
      id: "x",
      title: "X",
      shots: [
        {
          id: "s1",
          title: "S1",
          performance: {
            cast: { count: 2 },
            performers: [{}, {}],
          },
        },
      ],
    })
  ).toThrow(/cast/i);
});

it("rejects unknown directive keys and exports the axis list", () => {
  expect(() =>
    FilmDirectorInputSchema.parse({
      version: 2,
      id: "x",
      title: "X",
      shots: [
        {
          id: "s1",
          title: "S1",
          performance: { cast: { count: 1, defaults: { prop: { grab: "any" } } } },
        },
      ],
    })
  ).toThrow();
  expect(FILM_DIRECTOR_DIRECTIVE_AXES).toContain("prop");
  expect(FILM_DIRECTOR_DIRECTIVE_AXES).toContain("environmentId");
});
```

- [x] **Step 2: Run to verify the new tests fail**

Run: `pnpm exec vitest run tests/unit/film-director/film-director-schema.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: the 4 new tests FAIL; the 4 existing ones still pass.

- [x] **Step 3: Modify the schema**

In `film-director-schema.ts`:

1. Add the import: `import { directiveSchema } from "./directives";`
2. After `FILM_DIRECTOR_SCHEMA_VERSION`, add:

```ts
export const FILM_DIRECTOR_DIRECTIVE_AXES = [
  "avatarId",
  "prop",
  "effect",
  "effort",
  "staffLengthCm",
  "environmentId",
  "formation",
] as const;

const seedSchema = z
  .object({
    base: z.number().int().optional(),
    axes: z.record(z.string(), z.number().int()).optional(),
  })
  .strict();
```

3. Replace the five performer fields with directive-capable versions inside `performerSchema` (keep `id`, `name`, `position`, `facingDegrees`, `beatOffset` as-is — those stay literal-only):

```ts
    avatarId: directiveSchema(avatarIdSchema).optional(),
    prop: directiveSchema(z.nativeEnum(PropType)).optional(),
    effect: directiveSchema(effectIdSchema).optional(),
    effort: directiveSchema(z.enum(DIRECTOR_EFFORT_IDS)).optional(),
    staffLengthCm: directiveSchema(finiteNumber.min(40).max(300)).optional(),
```

4. Add the cast block and mutual exclusion to `performanceSchema`:

```ts
const castDefaultsSchema = z
  .object({
    avatarId: directiveSchema(avatarIdSchema).optional(),
    prop: directiveSchema(z.nativeEnum(PropType)).optional(),
    effect: directiveSchema(effectIdSchema).optional(),
    effort: directiveSchema(z.enum(DIRECTOR_EFFORT_IDS)).optional(),
    staffLengthCm: directiveSchema(finiteNumber.min(40).max(300)).optional(),
  })
  .strict();

const castSchema = z
  .object({
    count: z.number().int().min(1).max(8),
    defaults: castDefaultsSchema.optional(),
    performers: z.array(performerSchema).max(8).optional(),
  })
  .strict();

const performanceSchema = z
  .object({
    bpm: finiteNumber.min(20).max(300).optional(),
    sequence: z
      .object({ source: z.literal("demo"), loop: z.boolean().optional() })
      .strict()
      .optional(),
    formation: directiveSchema(z.enum(DIRECTOR_FORMATIONS)).optional(),
    cast: castSchema.optional(),
    performers: z.array(performerSchema).min(1).max(8).optional(),
  })
  .strict()
  .refine((value) => !(value.cast && value.performers), {
    message: "Use either a cast block or a performers array, not both.",
    path: ["cast"],
  });
```

5. Make `environmentId` directive-capable in `sceneSchema`: `environmentId: directiveSchema(environmentIdSchema).optional(),`
6. In `FilmDirectorInputSchema`: `version: z.union([z.literal(1), z.literal(FILM_DIRECTOR_SCHEMA_VERSION_2)])` — add `export const FILM_DIRECTOR_SCHEMA_VERSION_2 = 2 as const;` and add `seed: seedSchema.optional(),`.
7. `effectPresets` values become `z.union([z.string().min(1), z.object({ pick: z.literal("any") }).strict()])`.

Type exports: add `export type DirectorCastInput = z.infer<typeof castSchema>;`. The `ResolvedDirector*` interfaces are unchanged — resolution output stays fully concrete.

- [x] **Step 4: Run the schema tests**

Run: `pnpm exec vitest run tests/unit/film-director/film-director-schema.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (8 tests). Then run the full film-director suite (see Ground rules) — Task 5 has not landed yet, so `resolve-film-director-spec` still treats these fields as literals; if any existing test breaks here, the schema change leaked a behavioral change — stop and fix before proceeding.

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/film-director-schema.ts tests/unit/film-director/film-director-schema.test.ts
git commit -m "feat(film-director): schema v2 with cast block, seed, directive fields" -- src/routes/test/film-director/_lib/film-director-schema.ts tests/unit/film-director/film-director-schema.test.ts
```

---

### Task 5: Wire directives into spec resolution

**Files:**
- Modify: `src/routes/test/film-director/_lib/resolve-film-director-spec.ts`
- Test: create `tests/unit/film-director/resolve-directive-spec.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/film-director/resolve-directive-spec.test.ts
import { describe, expect, it } from "vitest";

import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";

function film(performance: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  return {
    version: 2,
    id: "directive-film",
    title: "Directive Film",
    shots: [{ id: "s1", title: "S1", performance }],
    ...extras,
  };
}

describe("resolveFilmDirectorSpec with directives", () => {
  it("resolves Austen's canonical example: 8 distinct props, fire everywhere, LED pinned on performer 3", () => {
    const spec = resolveFilmDirectorSpec(
      film({
        formation: "circle",
        cast: {
          count: 8,
          defaults: { prop: { pick: "distinct" }, effect: "fire" },
          performers: [{ id: "performer-3", effect: "led" }],
        },
      })
    );
    const performers = spec.shots[0]!.performance.performers;
    expect(performers).toHaveLength(8);
    expect(new Set(performers.map((p) => p.prop)).size).toBe(8);
    expect(performers[2]!.effect).toBe("led");
    expect(performers.filter((p) => p.effect === "fire")).toHaveLength(7);
  });

  it("is deterministic across runs and stable under an unrelated axis reroll", () => {
    const doc = film({ cast: { count: 4, defaults: { prop: { pick: "distinct" } } } });
    const first = resolveFilmDirectorSpec(doc);
    const second = resolveFilmDirectorSpec(doc);
    expect(first.shots[0]!.performance.performers).toEqual(
      second.shots[0]!.performance.performers
    );

    const rerolled = resolveFilmDirectorSpec({
      ...doc,
      seed: { axes: { effect: 5 } },
    });
    expect(rerolled.shots[0]!.performance.performers.map((p) => p.prop)).toEqual(
      first.shots[0]!.performance.performers.map((p) => p.prop)
    );
  });

  it("rerolling the prop axis changes props but not avatars", () => {
    const doc = film({
      cast: {
        count: 6,
        defaults: { prop: { pick: "distinct" }, avatarId: { pick: "distinct" } },
      },
    });
    const base = resolveFilmDirectorSpec(doc);
    const rerolled = resolveFilmDirectorSpec({ ...doc, seed: { axes: { prop: 1 } } });
    expect(rerolled.shots[0]!.performance.performers.map((p) => p.avatarId)).toEqual(
      base.shots[0]!.performance.performers.map((p) => p.avatarId)
    );
    expect(rerolled.shots[0]!.performance.performers.map((p) => p.prop)).not.toEqual(
      base.shots[0]!.performance.performers.map((p) => p.prop)
    );
  });

  it("resolves an open environment pick and respects formation valid counts", () => {
    const spec = resolveFilmDirectorSpec({
      version: 2,
      id: "env-film",
      title: "Env",
      shots: [
        {
          id: "s1",
          title: "S1",
          scene: { environmentId: { oneOf: ["ocean", "forest"] } },
          performance: { formation: { pick: "any" }, cast: { count: 3 } },
        },
      ],
    });
    expect(["ocean", "forest"]).toContain(spec.shots[0]!.scene.environmentId);
    expect(spec.shots[0]!.performance.formation).not.toBe("custom");
  });

  it("rejects an unsatisfiable distinct demand with the pool in the message", () => {
    expect(() =>
      resolveFilmDirectorSpec(
        film({
          cast: {
            count: 8,
            defaults: { prop: { pick: "distinct", from: ["staff", "fan", "club", "sword", "torch"] } },
          },
        })
      )
    ).toThrow(/8 performers.*5/s);
  });

  it("v1 documents resolve exactly as before", () => {
    const spec = resolveFilmDirectorSpec({
      version: 1,
      id: "v1",
      title: "V1",
      shots: [{ id: "s1", title: "S1" }],
    });
    expect(spec.shots[0]!.performance.performers[0]!.prop).toBe("staff");
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/film-director/resolve-directive-spec.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: FAIL — cast blocks and directives are not yet consumed by the resolver.

- [x] **Step 3: Implement resolution**

In `resolve-film-director-spec.ts`:

1. Imports:

```ts
import { EFFECTS, getRegistration } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
import { SceneEnvironmentId } from "$lib/shared/3d/environments/domain/scene-environment";
import { isDirectiveExpression, type DirectiveValue } from "./directives";
import { createAxisStream, resolveFilmSeed, seededPick, type FilmSeed } from "./directive-random";
import { resolveCastAxis } from "./resolve-directives";
import { DIRECTOR_EFFORT_IDS, DIRECTOR_FORMATIONS } from "./film-director-schema";
```

2. Axis catalogs, once at module scope:

```ts
const AXIS_CATALOGS = {
  avatarId: AVATAR_DEFINITIONS.map((avatar) => avatar.id as string),
  prop: Object.values(PropType) as string[],
  effect: ["none", ...EFFECTS.map((effect) => effect.id)],
  effort: [...DIRECTOR_EFFORT_IDS] as string[],
  staffLengthCm: null,
  environmentId: Object.values(SceneEnvironmentId) as string[],
  // "custom" needs per-performer positions, so open picks never select it.
  formation: DIRECTOR_FORMATIONS.filter((preset) => preset !== "custom") as string[],
} satisfies Record<string, readonly string[] | null>;
```

3. Normalize cast form: at the top of `resolveShot`, derive the performer input list from either shape:

```ts
const cast = shot.performance?.cast;
const performerInputs: PerformerInput[] = cast
  ? Array.from({ length: cast.count }, (_, index) => {
      const overrides = cast.performers ?? [];
      const byId = overrides.find(
        (candidate) => candidate.id === `performer-${index + 1}`
      );
      return { ...(byId ?? overrides[index] ?? {}) };
    })
  : (shot.performance?.performers?.length ? shot.performance.performers : [{}]);
```

Cast overrides match by explicit `id` first (`performer-N` convention), falling back to array position for id-less overrides. Note: with `cast`, an override with an id outside `performer-1..count` is a rejection: `Cast override "${id}" does not match any of the ${count} performers.` — implement that check right after.

4. Resolve directive axes BEFORE the existing per-performer mapping. For each axis in `avatarId | prop | effect | effort | staffLengthCm`, build the effective per-performer directive with precedence `performer value ?? cast.defaults value ?? system default literal` (system defaults: first-available avatar rotation as today, `PropType.STAFF`, `"none"`, `"linear"`, and for `staffLengthCm` a literal `null` bypass — a performer with no staff directive keeps `null`). Call `resolveCastAxis` with `createAxisStream(filmSeed, shot.id, axisName)` and write the concrete values back onto a working copy of `performerInputs`. Keep the existing avatar-catalog and formation-count validation paths — they now receive concrete values.

The film seed is resolved once in `resolveFilmDirectorSpec`: `const filmSeed = resolveFilmSeed(input.id, input.seed);` and threaded into `resolveShot` as a parameter.

5. Shot-scope directives: `environmentId` and `formation` accept single-value directives. Resolve with the same machinery via a helper:

```ts
function resolveShotAxis<T extends string>(
  value: DirectiveValue<T> | undefined,
  axis: "environmentId" | "formation",
  fallback: () => T,
  shotId: string,
  seed: FilmSeed,
  catalogOverride?: readonly T[]
): T {
  if (value === undefined) return fallback();
  if (!isDirectiveExpression(value)) return value;
  if ("sameAs" in value || ("pick" in value && value.pick === "distinct")) {
    throw new Error(
      `Shot "${shotId}": "${axis}" supports literals, pick:any, oneOf, and not — distinct/sameAs are performer-scoped.`
    );
  }
  const [resolved] = resolveCastAxis<T>({
    axis,
    shotId,
    performerIds: ["shot"],
    values: [value],
    catalog: (catalogOverride ?? (AXIS_CATALOGS[axis] as readonly T[])),
    random: createAxisStream(seed, shotId, axis),
  });
  return resolved!;
}
```

For `formation`, pass `catalogOverride` filtered to presets whose `PRESET_VALID_COUNTS` includes the performer count, so "any formation" can never produce a count mismatch. Resolve formation AFTER the performer count is known and BEFORE `resolvePerformers` runs.

6. `effectPresets` `{ pick: "any" }` values: resolve in `validateEffectPresets` → rename it `resolveEffectPresets(effectPresets, shotId, seed)` returning a concrete `Record<string, string>`; an open pick draws with `seededPick(registration.presetGroup.presets.map(p => p.id), createAxisStream(seed, shotId, \`effectPreset:${effectId}\`))`.

- [x] **Step 4: Run the new test, then the full film-director suite**

Run: `pnpm exec vitest run tests/unit/film-director/resolve-directive-spec.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (6 tests).
Then the full suite per Ground rules — all previously green tests must stay green (v1 path unchanged).

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/resolve-film-director-spec.ts tests/unit/film-director/resolve-directive-spec.test.ts
git commit -m "feat(film-director): resolve cast directives and shot-scope picks" -- src/routes/test/film-director/_lib/resolve-film-director-spec.ts tests/unit/film-director/resolve-directive-spec.test.ts
```

---

### Task 6: Camera framing grammar

**Files:**
- Create: `src/routes/test/film-director/_lib/camera-language.ts`
- Test: `tests/unit/film-director/camera-language.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/film-director/camera-language.test.ts
import { describe, expect, it } from "vitest";

import { computeCameraFraming } from "../../../src/routes/test/film-director/_lib/camera-language";

const CONTEXT = {
  durationSeconds: 8,
  aspectRatio: 16 / 9,
  groundOffset: 0,
  performers: [
    {
      id: "performer-1", name: "P1", avatarId: "y-bot" as never,
      prop: "staff" as never, effect: "none" as never, effort: "linear" as never,
      position: { x: -1, z: 0 }, facingAngle: 0, beatOffset: 0, staffLengthCm: null,
    },
    {
      id: "performer-2", name: "P2", avatarId: "x-bot" as never,
      prop: "staff" as never, effect: "none" as never, effort: "linear" as never,
      position: { x: 1, z: 0 }, facingAngle: 0, beatOffset: 0, staffLengthCm: null,
    },
  ],
};

function distance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("computeCameraFraming", () => {
  it("close-up is nearer than wide, which is nearer than extreme-wide", () => {
    const closeUp = computeCameraFraming({ shotSize: "close-up" }, CONTEXT);
    const wide = computeCameraFraming({ shotSize: "wide" }, CONTEXT);
    const extreme = computeCameraFraming({ shotSize: "extreme-wide" }, CONTEXT);
    expect(distance(closeUp.position, closeUp.target)).toBeLessThan(
      distance(wide.position, wide.target)
    );
    expect(distance(wide.position, wide.target)).toBeLessThan(
      distance(extreme.position, extreme.target)
    );
  });

  it("a performer subject targets that performer's position", () => {
    const framing = computeCameraFraming(
      { subject: { kind: "performer", performerId: "performer-2" } },
      CONTEXT
    );
    expect(framing.target[0]).toBeCloseTo(1, 5);
  });

  it("low angle puts the camera below eye target height; top well above", () => {
    const low = computeCameraFraming({ angle: "low" }, CONTEXT);
    const top = computeCameraFraming({ angle: "top" }, CONTEXT);
    expect(low.position[1]).toBeLessThan(low.target[1]);
    expect(top.position[1]).toBeGreaterThan(top.target[1] + 2);
  });

  it("left and behind vantages sit on opposite sides from right and front", () => {
    const front = computeCameraFraming({ position: "front" }, CONTEXT);
    const behind = computeCameraFraming({ position: "behind" }, CONTEXT);
    const left = computeCameraFraming({ position: "left" }, CONTEXT);
    const right = computeCameraFraming({ position: "right" }, CONTEXT);
    expect(Math.sign(front.position[2] - front.target[2])).not.toBe(
      Math.sign(behind.position[2] - behind.target[2])
    );
    expect(Math.sign(left.position[0] - left.target[0])).not.toBe(
      Math.sign(right.position[0] - right.target[0])
    );
  });

  it("rejects an unknown subject performer", () => {
    expect(() =>
      computeCameraFraming(
        { subject: { kind: "performer", performerId: "ghost" } },
        CONTEXT
      )
    ).toThrow(/ghost/);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/film-director/camera-language.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: FAIL — module not found.

- [x] **Step 3: Implement framing**

```ts
// src/routes/test/film-director/_lib/camera-language.ts
import { computeFramingShot } from "$lib/shared/3d/camera/compute-framing-shot";

import type {
  DirectorCameraTargetInput,
  ResolvedDirectorPerformer,
} from "./film-director-schema";

export type DirectorShotSize = "close-up" | "medium" | "wide" | "extreme-wide";
export type DirectorCameraAngle = "low" | "eye" | "high" | "top";
export type DirectorCameraVantage =
  | "front"
  | "left"
  | "right"
  | "behind"
  | { degrees: number };

export interface DirectorFramingInput {
  subject?: DirectorCameraTargetInput;
  shotSize?: DirectorShotSize;
  angle?: DirectorCameraAngle;
  position?: DirectorCameraVantage;
}

export interface CameraLanguageContext {
  durationSeconds: number;
  aspectRatio: number;
  groundOffset: number;
  performers: readonly ResolvedDirectorPerformer[];
}

export interface CameraFraming {
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
}

const SHOT_SIZE_MULTIPLIER: Record<DirectorShotSize, number> = {
  "close-up": 0.4,
  medium: 0.75,
  wide: 1.3,
  "extreme-wide": 1.9,
};

const ANGLE_ELEVATION_DEG: Record<DirectorCameraAngle, number> = {
  low: -12,
  eye: 4,
  high: 28,
  top: 65,
};

const VANTAGE_AZIMUTH_DEG: Record<Exclude<DirectorCameraVantage, { degrees: number }>, number> = {
  front: 0,
  right: -90,
  left: 90,
  behind: 180,
};

const MIN_DISTANCE_METERS = 1.2;
const CLOSE_UP_TARGET_HEIGHT = 1.45;

export function computeCameraFraming(
  input: DirectorFramingInput,
  context: CameraLanguageContext
): CameraFraming {
  const base = computeFramingShot({
    performers: context.performers.map((performer) => performer.position),
    plane: "wall",
    groundOffset: context.groundOffset,
    fovDeg: 50,
    aspectRatio: context.aspectRatio,
    paddingMult: 1.18,
    elevationDeg: 12,
  });
  const baseEye: [number, number, number] = [base.eye.x, base.eye.y, base.eye.z];
  const groupTarget: [number, number, number] = [
    base.target.x,
    base.target.y,
    base.target.z,
  ];

  const target = resolveSubject(input.subject, context, groupTarget);
  if (input.shotSize === "close-up" && input.subject?.kind === "performer") {
    target[1] = context.groundOffset + CLOSE_UP_TARGET_HEIGHT;
  }

  const baseDistance = Math.hypot(
    baseEye[0] - groupTarget[0],
    baseEye[1] - groupTarget[1],
    baseEye[2] - groupTarget[2]
  );
  const distance = Math.max(
    MIN_DISTANCE_METERS,
    baseDistance * SHOT_SIZE_MULTIPLIER[input.shotSize ?? "medium"]
  );

  // Azimuth 0 = the base framing's eye direction ("front of the group").
  const baseAzimuth = Math.atan2(
    baseEye[0] - groupTarget[0],
    baseEye[2] - groupTarget[2]
  );
  const vantage = input.position ?? "front";
  const vantageDeg =
    typeof vantage === "object" ? vantage.degrees : VANTAGE_AZIMUTH_DEG[vantage];
  const azimuth = baseAzimuth + (vantageDeg * Math.PI) / 180;
  const elevation =
    (ANGLE_ELEVATION_DEG[input.angle ?? "eye"] * Math.PI) / 180;

  const horizontal = distance * Math.cos(elevation);
  return {
    position: [
      target[0] + Math.sin(azimuth) * horizontal,
      target[1] + distance * Math.sin(elevation),
      target[2] + Math.cos(azimuth) * horizontal,
    ],
    target,
    fovDeg: 50,
  };
}

function resolveSubject(
  subject: DirectorCameraTargetInput | undefined,
  context: CameraLanguageContext,
  groupTarget: [number, number, number]
): [number, number, number] {
  if (!subject || subject.kind === "group") return [...groupTarget];
  if (subject.kind === "point") return [...subject.position];
  const performer = context.performers.find(
    (candidate) => candidate.id === subject.performerId
  );
  if (!performer) {
    throw new Error(
      `Camera subject references missing performer "${subject.performerId}".`
    );
  }
  return [
    performer.position.x,
    subject.height ?? groupTarget[1],
    performer.position.z,
  ];
}
```

- [x] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/film-director/camera-language.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/camera-language.ts tests/unit/film-director/camera-language.test.ts
git commit -m "feat(film-director): camera framing grammar" -- src/routes/test/film-director/_lib/camera-language.ts tests/unit/film-director/camera-language.test.ts
```

---

### Task 7: Camera move compiler

**Files:**
- Modify: `src/routes/test/film-director/_lib/camera-language.ts`
- Test: extend `tests/unit/film-director/camera-language.test.ts`

- [x] **Step 1: Write the failing tests** (append)

```ts
import { compileCameraMoves } from "../../../src/routes/test/film-director/_lib/camera-language";

describe("compileCameraMoves", () => {
  const framing = computeCameraFraming({ shotSize: "wide" }, CONTEXT);

  it("hold emits a step keyframe pair covering its window", () => {
    const frames = compileCameraMoves([{ move: "hold" }], framing, CONTEXT);
    expect(frames[0]!.atSeconds).toBe(0);
    expect(frames.at(-1)!.atSeconds).toBeCloseTo(CONTEXT.durationSeconds, 5);
  });

  it("push-in ends closer to the target; pull-back ends farther", () => {
    const push = compileCameraMoves(
      [{ move: "push-in", amount: { meters: 2 } }],
      framing,
      CONTEXT
    );
    const pull = compileCameraMoves(
      [{ move: "pull-back", amount: { meters: 2 } }],
      framing,
      CONTEXT
    );
    const dist = (frame: (typeof push)[number]) =>
      Math.hypot(
        frame.position[0] - frame.target[0],
        frame.position[1] - frame.target[1],
        frame.position[2] - frame.target[2]
      );
    expect(dist(push.at(-1)!)).toBeLessThan(dist(push[0]!));
    expect(dist(pull.at(-1)!)).toBeGreaterThan(dist(pull[0]!));
  });

  it("orbit sweeps the requested angle around the target", () => {
    const frames = compileCameraMoves(
      [{ move: "orbit", direction: "ccw", amount: { degrees: 90 } }],
      framing,
      CONTEXT
    );
    const angle = (frame: (typeof frames)[number]) =>
      Math.atan2(
        frame.position[0] - frame.target[0],
        frame.position[2] - frame.target[2]
      );
    const sweep = Math.abs(angle(frames.at(-1)!) - angle(frames[0]!));
    expect(sweep).toBeCloseTo(Math.PI / 2, 1);
  });

  it("moves chain: explicit durations consume time, the rest split evenly", () => {
    const frames = compileCameraMoves(
      [
        { move: "hold", durationSeconds: 2 },
        { move: "push-in" },
        { move: "orbit", direction: "cw", amount: { degrees: 45 } },
      ],
      framing,
      CONTEXT
    );
    expect(frames.at(-1)!.atSeconds).toBeCloseTo(8, 5);
  });

  it("rejects contradictions", () => {
    expect(() =>
      compileCameraMoves(
        [{ move: "orbit", direction: "up", amount: { degrees: 90 } }],
        framing,
        CONTEXT
      )
    ).toThrow(/orbit/i);
    expect(() =>
      compileCameraMoves(
        [{ move: "push-in", amount: { degrees: 30 } }],
        framing,
        CONTEXT
      )
    ).toThrow(/meters/i);
    expect(() =>
      compileCameraMoves(
        [
          { move: "hold", durationSeconds: 6 },
          { move: "push-in", durationSeconds: 6 },
        ],
        framing,
        CONTEXT
      )
    ).toThrow(/duration/i);
  });
});
```

- [x] **Step 2: Run to verify the new tests fail**

Run: `pnpm exec vitest run tests/unit/film-director/camera-language.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: 5 new FAIL (`compileCameraMoves` not exported), 5 existing PASS.

- [x] **Step 3: Implement the compiler** (append to `camera-language.ts`)

```ts
import type { ResolvedDirectorCameraKeyframe } from "./film-director-schema";

export interface DirectorCameraMove {
  move: "hold" | "push-in" | "pull-back" | "orbit" | "crane" | "pan";
  direction?: "cw" | "ccw" | "up" | "down" | "left" | "right";
  amount?: { degrees: number } | { meters: number };
  durationSeconds?: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

const MOVE_RULES: Record<
  DirectorCameraMove["move"],
  { unit: "degrees" | "meters" | null; directions: readonly string[] | null }
> = {
  hold: { unit: null, directions: null },
  "push-in": { unit: "meters", directions: null },
  "pull-back": { unit: "meters", directions: null },
  orbit: { unit: "degrees", directions: ["cw", "ccw"] },
  crane: { unit: "meters", directions: ["up", "down"] },
  pan: { unit: "degrees", directions: ["left", "right"] },
};

const ORBIT_SEGMENT_DEG = 30;

export function compileCameraMoves(
  moves: readonly DirectorCameraMove[],
  framing: CameraFraming,
  context: CameraLanguageContext
): ResolvedDirectorCameraKeyframe[] {
  const windows = allocateWindows(moves, context.durationSeconds);
  const frames: ResolvedDirectorCameraKeyframe[] = [];
  let position: [number, number, number] = [...framing.position];
  let target: [number, number, number] = [...framing.target];

  moves.forEach((move, index) => {
    validateMove(move);
    const { start, end } = windows[index]!;
    const easing = move.easing ?? "ease-in-out";
    const push = (
      atSeconds: number,
      pos: [number, number, number],
      tgt: [number, number, number],
      interpolation: ResolvedDirectorCameraKeyframe["interpolation"] = "smooth"
    ) => {
      const last = frames.at(-1);
      if (last && Math.abs(last.atSeconds - atSeconds) < 1e-6) frames.pop();
      frames.push({ atSeconds, position: pos, target: tgt, fovDeg: framing.fovDeg, interpolation, easing });
    };

    if (move.move === "hold") {
      push(start, [...position], [...target], "step");
      push(end, [...position], [...target], "step");
      return;
    }

    if (move.move === "push-in" || move.move === "pull-back") {
      const currentDistance = Math.hypot(
        position[0] - target[0], position[1] - target[1], position[2] - target[2]
      );
      const meters =
        move.amount && "meters" in move.amount
          ? move.amount.meters
          : currentDistance * 0.3;
      const sign = move.move === "push-in" ? -1 : 1;
      const nextDistance = Math.max(0.8, currentDistance + sign * meters);
      const next: [number, number, number] = [
        target[0] + ((position[0] - target[0]) / currentDistance) * nextDistance,
        target[1] + ((position[1] - target[1]) / currentDistance) * nextDistance,
        target[2] + ((position[2] - target[2]) / currentDistance) * nextDistance,
      ];
      push(start, [...position], [...target]);
      push(end, next, [...target]);
      position = next;
      return;
    }

    if (move.move === "orbit") {
      const degrees =
        (move.amount && "degrees" in move.amount ? move.amount.degrees : 90) *
        (move.direction === "cw" ? -1 : 1);
      const radius = Math.hypot(position[0] - target[0], position[2] - target[2]);
      const height = position[1];
      const startAngle = Math.atan2(position[0] - target[0], position[2] - target[2]);
      const segments = Math.max(2, Math.ceil(Math.abs(degrees) / ORBIT_SEGMENT_DEG));
      for (let seg = 0; seg <= segments; seg += 1) {
        const progress = seg / segments;
        const angle = startAngle + (degrees * Math.PI * progress) / 180;
        const pos: [number, number, number] = [
          target[0] + Math.sin(angle) * radius,
          height,
          target[2] + Math.cos(angle) * radius,
        ];
        push(start + (end - start) * progress, pos, [...target], "smooth");
        if (seg === segments) position = pos;
      }
      return;
    }

    if (move.move === "crane") {
      const meters =
        (move.amount && "meters" in move.amount ? move.amount.meters : 2) *
        (move.direction === "down" ? -1 : 1);
      const next: [number, number, number] = [position[0], position[1] + meters, position[2]];
      push(start, [...position], [...target]);
      push(end, next, [...target]);
      position = next;
      return;
    }

    // pan: rotate the aim point around the camera.
    const degrees =
      (move.amount && "degrees" in move.amount ? move.amount.degrees : 30) *
      (move.direction === "right" ? -1 : 1);
    const dx = target[0] - position[0];
    const dz = target[2] - position[2];
    const angle = (degrees * Math.PI) / 180;
    const next: [number, number, number] = [
      position[0] + dx * Math.cos(angle) + dz * Math.sin(angle),
      target[1],
      position[2] - dx * Math.sin(angle) + dz * Math.cos(angle),
    ];
    push(start, [...position], [...target]);
    push(end, [...position], next);
    target = next;
  });

  if (frames[0]!.atSeconds !== 0) {
    frames.unshift({ ...frames[0]!, atSeconds: 0 });
  }
  return frames;
}

function validateMove(move: DirectorCameraMove): void {
  const rules = MOVE_RULES[move.move];
  if (move.amount) {
    const unit = "degrees" in move.amount ? "degrees" : "meters";
    if (rules.unit === null) {
      throw new Error(`"${move.move}" does not take an amount.`);
    }
    if (unit !== rules.unit) {
      throw new Error(`"${move.move}" takes ${rules.unit}, not ${unit}.`);
    }
  }
  if (move.direction) {
    if (!rules.directions) {
      throw new Error(`"${move.move}" does not take a direction.`);
    }
    if (!rules.directions.includes(move.direction)) {
      throw new Error(
        `"${move.move}" direction must be one of ${rules.directions.join("/")}, got "${move.direction}".`
      );
    }
  }
}

function allocateWindows(
  moves: readonly DirectorCameraMove[],
  durationSeconds: number
): { start: number; end: number }[] {
  const explicit = moves.reduce(
    (sum, move) => sum + (move.durationSeconds ?? 0),
    0
  );
  if (explicit > durationSeconds + 1e-6) {
    throw new Error(
      `Camera moves total ${explicit}s but the shot's duration is ${durationSeconds}s.`
    );
  }
  const openCount = moves.filter((move) => move.durationSeconds === undefined).length;
  const openShare = openCount ? (durationSeconds - explicit) / openCount : 0;
  let cursor = 0;
  return moves.map((move) => {
    const length = move.durationSeconds ?? openShare;
    const window = { start: cursor, end: cursor + length };
    cursor += length;
    return window;
  });
}
```

- [x] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/film-director/camera-language.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS (10 tests).

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/camera-language.ts tests/unit/film-director/camera-language.test.ts
git commit -m "feat(film-director): camera move compiler" -- src/routes/test/film-director/_lib/camera-language.ts tests/unit/film-director/camera-language.test.ts
```

---

### Task 8: Wire camera grammar into the schema and camera track

**Files:**
- Modify: `src/routes/test/film-director/_lib/film-director-schema.ts` (camera schema)
- Modify: `src/routes/test/film-director/_lib/director-camera-track.ts`
- Test: extend `tests/unit/film-director/director-camera-track.test.ts`

- [x] **Step 1: Write the failing tests** (append to the existing test file; reuse its performer/context fixtures)

```ts
it("compiles framing + moves into a keyframe track", () => {
  const frames = resolveDirectorCameraTrack(
    {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "low",
      moves: [
        { move: "hold", durationSeconds: 2 },
        { move: "orbit", direction: "ccw", amount: { degrees: 90 } },
      ],
    } as never,
    CONTEXT
  );
  expect(frames[0]!.atSeconds).toBe(0);
  expect(frames.at(-1)!.atSeconds).toBeCloseTo(CONTEXT.durationSeconds, 5);
});

it("rejects mixing keyframes with framing grammar", () => {
  expect(() =>
    resolveDirectorCameraTrack(
      {
        shotSize: "wide",
        keyframes: [{ atSeconds: 0, position: [0, 1, -4] }],
      } as never,
      CONTEXT
    )
  ).toThrow(/keyframes/i);
});

it("rejects mixing a preset with framing grammar", () => {
  expect(() =>
    resolveDirectorCameraTrack(
      { preset: "group-orbit", shotSize: "close-up" } as never,
      CONTEXT
    )
  ).toThrow(/preset/i);
});
```

(`CONTEXT` here means the existing test file's camera-track context fixture — match its actual name when appending.)

- [x] **Step 2: Run to verify the new tests fail**

Run: `pnpm exec vitest run tests/unit/film-director/director-camera-track.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: new tests FAIL; existing 3 PASS.

- [x] **Step 3: Implement**

Schema (`film-director-schema.ts`), add to `cameraSchema`'s object before `.strict()`:

```ts
    subject: cameraTargetSchema.optional(),
    shotSize: z.enum(["close-up", "medium", "wide", "extreme-wide"]).optional(),
    angle: z.enum(["low", "eye", "high", "top"]).optional(),
    position: z
      .union([
        z.enum(["front", "left", "right", "behind"]),
        z.object({ degrees: finiteNumber.min(-360).max(360) }).strict(),
      ])
      .optional(),
    moves: z
      .array(
        z
          .object({
            move: z.enum(["hold", "push-in", "pull-back", "orbit", "crane", "pan"]),
            direction: z.enum(["cw", "ccw", "up", "down", "left", "right"]).optional(),
            amount: z
              .union([
                z.object({ degrees: finiteNumber }).strict(),
                z.object({ meters: finiteNumber.positive() }).strict(),
              ])
              .optional(),
            durationSeconds: finiteNumber.positive().optional(),
            easing: z.enum(DIRECTOR_EASINGS).optional(),
          })
          .strict()
      )
      .min(1)
      .max(16)
      .optional(),
```

And extend the camera `.refine` chain with two exclusivity rules:

```ts
  .refine(
    (camera) =>
      !camera.keyframes ||
      !(camera.shotSize || camera.angle || camera.position || camera.moves || camera.subject),
    { message: "Raw keyframes and framing grammar are exclusive — use one.", path: ["keyframes"] }
  )
  .refine(
    (camera) =>
      !camera.preset ||
      camera.preset === "custom" ||
      !(camera.shotSize || camera.angle || camera.position || camera.moves),
    { message: "A preset and framing grammar are exclusive — use one.", path: ["preset"] }
  )
```

Camera track (`director-camera-track.ts`): in `resolveDirectorCameraTrack`, after the `input?.keyframes?.length` branch, insert the grammar branch:

```ts
  const usesGrammar = Boolean(
    input && (input.shotSize || input.angle || input.position || input.moves || input.subject)
  );
  if (usesGrammar) {
    const framing = computeCameraFraming(
      {
        subject: input!.subject,
        shotSize: input!.shotSize,
        angle: input!.angle,
        position: input!.position,
      },
      context
    );
    return compileCameraMoves(input!.moves ?? [{ move: "hold" }], framing, context);
  }
```

with imports `import { compileCameraMoves, computeCameraFraming } from "./camera-language";`. A framing with no `moves` becomes a single held shot. Preset defaulting stays below, untouched — v1 films render identically.

Note: `subject` doubles as the framing target; the existing `target` field remains for presets/keyframes. Add a refine rejecting `subject` + `target` together: message `Use "subject" with framing grammar, "target" with presets/keyframes.`

- [x] **Step 4: Run camera-track tests, then the full suite**

Run: `pnpm exec vitest run tests/unit/film-director/director-camera-track.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS. Full suite per Ground rules: green.

- [x] **Step 5: Commit**

```bash
git add src/routes/test/film-director/_lib/film-director-schema.ts src/routes/test/film-director/_lib/director-camera-track.ts tests/unit/film-director/director-camera-track.test.ts
git commit -m "feat(film-director): camera grammar in schema and track resolution" -- src/routes/test/film-director/_lib/film-director-schema.ts src/routes/test/film-director/_lib/director-camera-track.ts tests/unit/film-director/director-camera-track.test.ts
```

---

### Task 9: Migrate the sample film to v2 and verify the route

**Files:**
- Modify: `src/routes/test/film-director/_films/sky-is-the-limit.ts`

- [x] **Step 1: Migrate**

Change `version: 1` to `version: 2`. Nothing else — v1's all-literal form is valid v2. Do NOT rewrite the shots with directives; this film is the approved reference and its resolved output must not change.

- [x] **Step 2: Run the full film-director suite**

Per Ground rules. Expected: all green.

- [x] **Step 3: Verify the route renders**

The dev server on :5173 is Austen's — do not start/restart it. Confirm it serves:
`curl -k -g -s -o /dev/null -w "%{http_code}" 'https://[::1]:5173/test/film-director' --max-time 15` → expect `200`.
Then open `https://localhost:5173/test/film-director` in the in-app Browser pane and confirm the film prepares and plays (canvas mounts, no console errors). If the server is down, ask Austen to restart from Agent Hub — never start it.

- [x] **Step 4: Commit**

```bash
git add src/routes/test/film-director/_films/sky-is-the-limit.ts
git commit -m "chore(film-director): sample film to schema v2" -- src/routes/test/film-director/_films/sky-is-the-limit.ts
```

---

### Task 10: Capability sweep + truth matrix + lockstep test

**Files:**
- Create: `docs/reference/film-director-capability-matrix.md`
- Test: `tests/unit/film-director/capability-matrix.test.ts`

- [x] **Step 1: Sweep the real control surface**

Read `src/routes/test/film-director/_lib/director-viewer-adapter.ts` and the `PerformerState` API it calls (grep `setAvatarModel|setProp|setEffect|setEffort|setStaffLengthCm|setDisplayName|snapFacingAngle` in `node_modules/@austencloud/scene-3d/dist/lib/` and `src/lib/shared/3d/`). List EVERY setter the adapter could call but the schema cannot express (candidate known unknowns: per-performer prop color, avatar scale, per-plane overrides — `customBluePlane`/`customRedPlane` are hardwired to `Plane.WALL` in `buildDirectorViewerSeed`). For each: if the viewer supports it per performer, file it in the matrix's "Real but not yet speakable" section with the setter path — do NOT silently widen the schema in this task. If it does not exist, it belongs in the corpus's unknown-axis rejections.

- [x] **Step 2: Write the matrix doc**

`docs/reference/film-director-capability-matrix.md` — structure (fill every row from the sweep + the schema as actually landed; the axes comment MUST match `FILM_DIRECTOR_DIRECTIVE_AXES` exactly):

```markdown
# Film Director Capability Matrix

<!-- directive-axes: avatarId,prop,effect,effort,staffLengthCm,environmentId,formation -->

One row per speakable axis of the `/test/film-director` schema (v2). "Source
of truth" is the live registry/enum — never copy value lists here.

| Axis | Scope | Grammar | Source of truth | Rejection behavior |
|---|---|---|---|---|
| prop | performer | literal, pick any/distinct, oneOf, not, sameAs | `src/lib/shared/pictograph/prop/domain/enums/prop-type.ts` | unknown value names the value + catalog |
| avatarId | performer | (same) | `@austencloud/scene-3d` `AVATAR_DEFINITIONS` | (same) |
| effect | performer | (same; "none" legal) | `effect-registry.ts` | (same) |
| effort | performer | (same) | `DIRECTOR_EFFORT_IDS` (schema) | (same) |
| staffLengthCm | performer | literal, directives with explicit `from` only | schema bounds 40–300 | open pick without `from` rejects |
| environmentId | shot | literal, pick any, oneOf, not | `scene-environment.ts` | distinct/sameAs reject at shot scope |
| formation | shot | literal, pick any, oneOf, not | `DIRECTOR_FORMATIONS` + `PRESET_VALID_COUNTS`; open picks exclude "custom" | count mismatch names formation + count |
| effectPresets | shot | literal preset id or {pick:"any"} per effect | effect registry preset groups | unknown effect/preset named |
| camera framing | shot | subject/shotSize/angle/position + moves | `camera-language.ts` | exclusivity + unit/direction contradictions |
| ... | | | | |

## Real but not yet speakable
(from the Step 1 sweep — setter path + one-line status each)

## Spoken but not real (proven rejections)
prop color per performer (if absent), lighting, avatar scale, 9+ performers, ...
```

Every `...` row above must be filled in during execution — the matrix must cover ALL schema axes including bpm, duration, transition, stage/audience, sceneFeatures, seed, format, playback.

- [x] **Step 3: Write the lockstep test**

```ts
// tests/unit/film-director/capability-matrix.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FILM_DIRECTOR_DIRECTIVE_AXES } from "../../../src/routes/test/film-director/_lib/film-director-schema";

describe("capability matrix lockstep", () => {
  it("the matrix doc lists exactly the schema's directive-capable axes", () => {
    const doc = readFileSync(
      resolve(__dirname, "../../../docs/reference/film-director-capability-matrix.md"),
      "utf8"
    );
    const match = doc.match(/<!-- directive-axes: ([^>]+) -->/);
    expect(match).not.toBeNull();
    const documented = match![1]!.split(",").map((axis) => axis.trim()).sort();
    expect(documented).toEqual([...FILM_DIRECTOR_DIRECTIVE_AXES].sort());
  });
});
```

- [x] **Step 4: Run it**

Run: `pnpm exec vitest run tests/unit/film-director/capability-matrix.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add docs/reference/film-director-capability-matrix.md tests/unit/film-director/capability-matrix.test.ts
git commit -m "docs(film-director): capability truth matrix with lockstep test" -- docs/reference/film-director-capability-matrix.md tests/unit/film-director/capability-matrix.test.ts
```

---

### Task 11: Adversarial corpus

**Files:**
- Create: `tests/unit/film-director/directive-corpus/_types.ts`, `_helpers.ts`, `distribution.ts`, `pin-exclusion.ts`, `unsatisfiable.ts`, `nonexistent.ts`, `camera.ts`, `boundary.ts`, `unknown-axis.ts`, `corpus-runner.test.ts`

- [x] **Step 1: Fixture types and helpers**

```ts
// tests/unit/film-director/directive-corpus/_types.ts
import type { ResolvedFilmDirectorSpec } from "../../../../src/routes/test/film-director/_lib/film-director-schema";

export interface CorpusEntry {
  id: string;
  /** The human sentence, exactly as a director would say it. */
  utterance: string;
  /** The canonical translation of the utterance. */
  film: unknown;
  expect:
    | { outcome: "resolves"; assert?: (spec: ResolvedFilmDirectorSpec) => void }
    | { outcome: "rejects"; messageIncludes: string };
}
```

```ts
// tests/unit/film-director/directive-corpus/_helpers.ts
export function corpusFilm(
  id: string,
  shot: Record<string, unknown>,
  extras: Record<string, unknown> = {}
): unknown {
  return {
    version: 2,
    id,
    title: id,
    shots: [{ id: "s1", title: "S1", ...shot }],
    ...extras,
  };
}
```

- [x] **Step 2: Author the fixtures**

Each category file exports `entries: CorpusEntry[]`. Authoring bar (definition of done):

- **≥ 200 entries total, ≥ 25 per category, ≥ 30% rejections overall.**
- Every utterance is a sentence a human director would actually say — no schema-speak ("Give everyone a different prop, I don't care which", "Nobody spins fire in this one", "Put the tall LED guy front and center… actually just make performer 5 LED", "Nine performers in a circle", "Close-up on performer two, then swing around her slowly").
- Every entry's `film` is the honest translation of its utterance — if a human names something that doesn't exist (dragon avatar, chainsaw, "the moon environment"), translate it literally so the resolver rejects it, and assert the rejection message names the offending value.
- `resolves` entries assert the property the utterance demanded (distinctness, the pin, the exclusion, the count), not just absence of error, wherever the utterance makes a checkable claim.

Three complete examples of the required shape (from `pin-exclusion.ts`):

```ts
import type { CorpusEntry } from "./_types";
import { corpusFilm } from "./_helpers";

export const entries: CorpusEntry[] = [
  {
    id: "pin-led-exclude-others",
    utterance:
      "Eight performers. Everyone gets fire except performer 3, who gets LED no matter what — and nobody else is allowed LED.",
    film: corpusFilm("pin-led-exclude-others", {
      performance: {
        formation: "circle",
        cast: {
          count: 8,
          defaults: { effect: "fire" },
          performers: [{ id: "performer-3", effect: "led" }],
        },
      },
    }),
    expect: {
      outcome: "resolves",
      assert: (spec) => {
        const performers = spec.shots[0]!.performance.performers;
        if (performers[2]!.effect !== "led") throw new Error("performer-3 must be led");
        if (performers.filter((p) => p.effect === "led").length !== 1)
          throw new Error("only performer-3 may be led");
      },
    },
  },
  {
    id: "anything-but-led",
    utterance: "Give performer 1 anything except LED.",
    film: corpusFilm("anything-but-led", {
      performance: { cast: { count: 1, performers: [{ effect: { not: "led" } }] } },
    }),
    expect: {
      outcome: "resolves",
      assert: (spec) => {
        if (spec.shots[0]!.performance.performers[0]!.effect === "led")
          throw new Error("led was excluded");
      },
    },
  },
  {
    id: "nine-performers",
    utterance: "Nine performers in a circle.",
    film: corpusFilm("nine-performers", {
      performance: { formation: "circle", cast: { count: 9 } },
    }),
    expect: { outcome: "rejects", messageIncludes: "8" },
  },
];
```

- [x] **Step 3: Write the runner**

```ts
// tests/unit/film-director/directive-corpus/corpus-runner.test.ts
import { describe, expect, it } from "vitest";

import { resolveFilmDirectorSpec } from "../../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import { entries as distribution } from "./distribution";
import { entries as pinExclusion } from "./pin-exclusion";
import { entries as unsatisfiable } from "./unsatisfiable";
import { entries as nonexistent } from "./nonexistent";
import { entries as camera } from "./camera";
import { entries as boundary } from "./boundary";
import { entries as unknownAxis } from "./unknown-axis";
import type { CorpusEntry } from "./_types";

const CATEGORIES: Record<string, CorpusEntry[]> = {
  distribution,
  "pin-exclusion": pinExclusion,
  unsatisfiable,
  nonexistent,
  camera,
  boundary,
  "unknown-axis": unknownAxis,
};

describe("adversarial directive corpus", () => {
  it("meets the coverage bar", () => {
    const all = Object.values(CATEGORIES).flat();
    expect(all.length).toBeGreaterThanOrEqual(200);
    for (const [name, entries] of Object.entries(CATEGORIES)) {
      expect(entries.length, name).toBeGreaterThanOrEqual(25);
    }
    const rejections = all.filter((entry) => entry.expect.outcome === "rejects");
    expect(rejections.length / all.length).toBeGreaterThanOrEqual(0.3);
    expect(new Set(all.map((entry) => entry.id)).size).toBe(all.length);
  });

  for (const [category, entries] of Object.entries(CATEGORIES)) {
    describe(category, () => {
      for (const entry of entries) {
        it(`${entry.id}: ${entry.utterance.slice(0, 80)}`, () => {
          if (entry.expect.outcome === "rejects") {
            const expected = entry.expect.messageIncludes;
            expect(() => resolveFilmDirectorSpec(entry.film)).toThrow();
            try {
              resolveFilmDirectorSpec(entry.film);
            } catch (error) {
              expect(String(error)).toContain(expected);
            }
            return;
          }
          const spec = resolveFilmDirectorSpec(entry.film);
          entry.expect.assert?.(spec);
        });
      }
    });
  }
});
```

- [x] **Step 4: Run the corpus, fix what it finds**

Run: `pnpm exec vitest run tests/unit/film-director/directive-corpus/corpus-runner.test.ts --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`
Expected: everything passes. Corpus failures are FINDINGS, not test bugs: a `resolves` entry that rejects, or a rejection with a vague message, means the resolver (or a message) needs fixing — fix the implementation, not the fixture, unless the fixture's translation was dishonest. Iterate until green.

- [x] **Step 5: Run the FULL film-director suite one final time, then commit**

```bash
git add tests/unit/film-director/directive-corpus
git commit -m "test(film-director): adversarial directive corpus (200+ utterances)" -- tests/unit/film-director/directive-corpus
```

---

### Task 12: Deliver

- [x] **Step 1:** Run the complete evidence set and capture output: full film-director suite + performer tests (the 27 baseline tests) + all new test files.
- [x] **Step 2:** Open `https://localhost:5173/test/film-director` in the in-app Browser pane (never a bare link) and confirm the migrated film still prepares and plays.
- [x] **Step 3:** Report to Austen: test counts with output, the corpus size and rejection ratio, the matrix's "Real but not yet speakable" findings (these are HIS decision queue for the next pass), and 2–3 corpus utterances with their resolved output as a demonstration that dictation now round-trips through the machine.

---

## Self-review notes

- Spec §1–§3 → Tasks 1–5. Spec §4 → Tasks 6–8. Spec §5 → Task 10. Spec §6 → Task 11. Spec §7 → Tasks 4 (version union) + 9 (migration). Spec §8 → each task's tests + Task 10's lockstep.
- Presets are left as an untouched code path (not desugared) so the approved film's pixels cannot change; the matrix documents preset↔grammar equivalence. This narrows spec §4's "presets become sugar" to "presets coexist with the grammar" — deliberate, to protect the approved reference film.
- `staffLengthCm` directives require explicit `from` pools (no finite catalog) — enforced by `resolveCastAxis`'s null-catalog error.
- Types referenced across tasks: `DirectiveValue`/`normalizeDirective` (Task 1) used by Tasks 3, 5; `FilmSeed`/`createAxisStream` (Task 2) used by Tasks 3, 5; `computeCameraFraming`/`compileCameraMoves` (Tasks 6–7) used by Task 8; `FILM_DIRECTOR_DIRECTIVE_AXES` (Task 4) used by Task 10.
