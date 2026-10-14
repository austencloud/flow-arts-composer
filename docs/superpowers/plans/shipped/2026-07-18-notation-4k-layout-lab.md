# Notation 4K Layout Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build /test/notation-4k, a native Svelte layout laboratory that switches the same real notation content between Editorial Atlas and Cinematic Runway compositions.

**Architecture:** The route owns a typed "atlas" | "cinematic" state and renders one persistent NotationLayoutStudy. Focused Svelte components compose existing primitives and the shared demo sequence; the selected mode changes only a data-layout attribute consumed by component-scoped CSS and container queries.

**Tech Stack:** Svelte 5 runes, SvelteKit /test client-only harness, TypeScript, CSS Grid, container queries, Vitest source-contract tests, existing TKA marketing and pictograph primitives.

## Global Constraints

- Do not modify production /notation, public-editorial.css, or shared primitives.
- Use MarketingChrome, SegmentedControl, PictographContainer, SequenceHeroDemo, and demo-sequence.json directly.
- Keep one shared content tree and one live player instance across layout switches.
- Use component-scoped styles and the project variable hierarchy. Add no global utilities.
- Essential text stays at or above 14px; supplementary text stays at or above 12px.
- Mobile-first layouts must not scroll horizontally.
- Mark the route noindex and inherit the existing /test client-only layout.
- Do not use browser verification without explicit permission in the current conversation.
- Preserve all user changes outside the files named here.

---

### Task 1: Real Rosetta and Shape Matrix artifacts

**Files:**

- Create: tests/unit/notation-4k-layout-contract.test.ts
- Create: src/routes/test/notation-4k/\_components/NotationRosetta.svelte
- Create: src/routes/test/notation-4k/\_components/NotationShapeMatrix.svelte

**Interfaces:**

- NotationRosetta consumes pictograph: StepData.
- NotationShapeMatrix consumes no props.
- TKA rendering comes only from PictographContainer.

- [ ] **Step 1: Write the failing artifact contract tests**

  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";
  import { describe, expect, it } from "vitest";

  const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

  describe("notation 4K layout lab artifacts", () => {
  it("renders the TKA specimen through the real pictograph primitive", () => {
  const source = read(
  "src/routes/test/notation-4k/\_components/NotationRosetta.svelte"
  );
  expect(source).toContain(
  'import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte"'
  );
  expect(source).toContain("<PictographContainer");
  expect(source).toContain('aria-label="A two by two grid');
  expect(source).not.toContain("kinetic-alphabet-letter-a.webp");
  });

      it("keeps all 144 Shape Matrix pairings and names both axes", () => {
        const source = read(
          "src/routes/test/notation-4k/_components/NotationShapeMatrix.svelte"
        );
        expect(source).toContain("Array.from({ length: 144 })");
        expect(source).toContain("Left-hand driving styles (12)");
        expect(source).toContain("Right-hand driving styles (12)");
        expect(source).toContain("as _, i (i)");
      });

  });

- [ ] **Step 2: Run the contract tests and verify RED**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts

Expected: FAIL because both component files are absent.

- [ ] **Step 3: Implement NotationRosetta.svelte**

Use this exact public interface and semantic structure:

    <script lang="ts">
      import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
      import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

      let { pictograph }: { pictograph: StepData } = $props();
    </script>

    <div class="rosetta" aria-label="Three notation systems compared">
      <figure class="specimen">
        <div class="artifact qft-artifact">
          <svg viewBox="0 0 200 200" role="img"
            aria-label="QFT circle with eight numbered points and a move from eight to one">
            <defs>
              <marker id="lab-qft-arrow" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
              </marker>
            </defs>
            <circle cx="100" cy="100" r="78" class="qft-ring" />
            <g class="qft-points">
              <circle cx="100" cy="22" r="12" /><text x="100" y="26">8</text>
              <circle cx="155" cy="45" r="12" /><text x="155" y="49">1</text>
              <circle cx="178" cy="100" r="12" /><text x="178" y="104">2</text>
              <circle cx="155" cy="155" r="12" /><text x="155" y="159">3</text>
              <circle cx="100" cy="178" r="12" /><text x="100" y="182">4</text>
              <circle cx="45" cy="155" r="12" /><text x="45" y="159">5</text>
              <circle cx="22" cy="100" r="12" /><text x="22" y="104">6</text>
              <circle cx="45" cy="45" r="12" /><text x="45" y="49">7</text>
            </g>
            <path class="qft-move" d="M113 26 Q140 26 147 39" fill="none"
              marker-end="url(#lab-qft-arrow)" />
          </svg>
        </div>
        <figcaption><strong>QFT</strong> records where a prop begins and arrives.</figcaption>
      </figure>

      <figure class="specimen">
        <div class="artifact">
          <div class="vtg-grid" role="img"
            aria-label="A two by two grid with split and together timing against same and opposite direction">
            <span></span><span>Same</span><span>Opp</span>
            <span>Split</span><strong>SS</strong><span>SO</span>
            <span>Tog</span><span>TS</span><span>TO</span>
          </div>
        </div>
        <figcaption><strong>VTG</strong> classifies timing and direction.</figcaption>
      </figure>

      <figure class="specimen">
        <div class="artifact pictograph-artifact">
          <PictographContainer pictographData={pictograph} darkMode={true}
            showGrid={true} showTKA={true} />
        </div>
        <figcaption><strong>TKA</strong> draws the complete beat.</figcaption>
      </figure>
    </div>

Add component-scoped mobile-first CSS: one column by default, three columns above a 52rem component container, square artifacts, no blur, theme strokes, 12px minimum captions, and stable aspect ratios.

- [ ] **Step 4: Implement NotationShapeMatrix.svelte**

<figure class="matrix-figure">
  <div class="matrix-graphic" role="img"
    aria-label="A twelve by twelve grid of left-hand and right-hand driving-style combinations with matched styles highlighted on the diagonal">
    <span class="axis axis-x">Left-hand driving styles (12)</span>
    <span class="axis axis-y">Right-hand driving styles (12)</span>
    <div class="matrix" aria-hidden="true">
      {#each Array.from({ length: 144 }) as _, i (i)}
        <span class="cell" class:matched={i % 12 === Math.floor(i / 12)}></span>
      {/each}
    </div>
  </div>
  <figcaption>
    The diagonal holds matched styles. Every off-diagonal cell is a hybrid.
  </figcaption>
</figure>

Add component-scoped CSS with a square matrix, explicit axes, 2px cell gaps, an amber diagonal, and container-relative sizing that stays visible in both layouts.

- [ ] **Step 5: Run focused tests and verify GREEN**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts

Expected: 2 tests pass.

- [ ] **Step 6: Format and commit**

  pnpm exec prettier --write tests/unit/notation-4k-layout-contract.test.ts "src/routes/test/notation-4k/\_components/\*.svelte"
  git add -- tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/\_components/NotationRosetta.svelte src/routes/test/notation-4k/\_components/NotationShapeMatrix.svelte
  git commit -m "feat(notation): add real layout-lab artifacts"

### Task 2: Real live sequence stage

**Files:**

- Modify: tests/unit/notation-4k-layout-contract.test.ts
- Create: src/routes/test/notation-4k/\_components/NotationSequenceStage.svelte

**Interfaces:**

- Consumes sequence: SequenceData.
- Produces one SequenceHeroDemo plus an eight-beat PictographContainer strip sourced from the same sequence.

- [ ] **Step 1: Add the failing sequence-stage contract**

  it("composes one real live player with real rendered beats", () => {
  const source = read(
  "src/routes/test/notation-4k/\_components/NotationSequenceStage.svelte"
  );
  expect(source).toContain(
  'import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte"'
      );
      expect(source).toContain(
        'import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte"'
  );
  expect(source.match(/<SequenceHeroDemo\b/g)).toHaveLength(1);
  expect(source).toContain("{#each sequence.steps as step, index (step.id)}");
  expect(source).not.toMatch(/\{#if\s+layoutMode/);
  });

- [ ] **Step 2: Run the new test and verify RED**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts -t "composes one real live player"

Expected: FAIL because NotationSequenceStage.svelte is absent.

- [ ] **Step 3: Implement the sequence stage**

    <script lang="ts">
      import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
      import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
      import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

      let { sequence }: { sequence: SequenceData } = $props();
    </script>

    <div class="sequence-stage">
      <div class="player-cell">
        <SequenceHeroDemo {sequence} note="pictographs beside the animation" />
      </div>
      <div class="score-cell">
        <p class="score-label">The score</p>
        <div class="beat-strip" aria-label="Eight sequence pictographs">
          {#each sequence.steps as step, index (step.id)}
            <figure class="beat">
              <div class="beat-art">
                <PictographContainer pictographData={step} darkMode={true}
                  showGrid={true} showTKA={true} stepNumberOverride={false} />
              </div>
              <figcaption>{index + 1}</figcaption>
            </figure>
          {/each}
        </div>
      </div>
    </div>

Add a named inline-size container. Stack by default. Above 64rem, use columns minmax(20rem, 0.8fr) and minmax(0, 1.4fr). The beat strip uses four columns at medium widths and eight when its container permits. Do not override SequenceHeroDemo internals or distort its square stage.

- [ ] **Step 4: Verify GREEN, format, and commit**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts
  pnpm exec prettier --write tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/\_components/NotationSequenceStage.svelte
  git add -- tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/\_components/NotationSequenceStage.svelte
  git commit -m "feat(notation): compose real sequence layout-lab stage"

Expected: 3 tests pass.

### Task 3: One shared dual-layout content tree

**Files:**

- Modify: tests/unit/notation-4k-layout-contract.test.ts
- Create: src/routes/test/notation-4k/\_components/NotationLayoutStudy.svelte

**Interfaces:**

- Consumes layoutMode: "atlas" | "cinematic" and sequence: SequenceData.
- Produces one semantic article carrying data-layout={layoutMode} and one instance of each artifact.

- [ ] **Step 1: Add the failing shared-tree contract**

  it("switches composition on one shared content tree", () => {
  const source = read(
  "src/routes/test/notation-4k/\_components/NotationLayoutStudy.svelte"
  );
  expect(source).toContain("data-layout={layoutMode}");
  expect(source.match(/<NotationRosetta\b/g)).toHaveLength(1);
  expect(source.match(/<NotationShapeMatrix\b/g)).toHaveLength(1);
  expect(source.match(/<NotationSequenceStage\b/g)).toHaveLength(1);
  expect(source).not.toMatch(/\{#if\s+layoutMode/);
  expect(source).toContain("@container notation-study (min-width: 96rem)");
  expect(source).toContain('[data-layout="atlas"]');
  expect(source).toContain('[data-layout="cinematic"]');
  });

- [ ] **Step 2: Run the new test and verify RED**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts -t "switches composition"

Expected: FAIL because NotationLayoutStudy.svelte is absent.

- [ ] **Step 3: Implement the shared semantic article**

    <script lang="ts">
      import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
      import NotationRosetta from "./NotationRosetta.svelte";
      import NotationShapeMatrix from "./NotationShapeMatrix.svelte";
      import NotationSequenceStage from "./NotationSequenceStage.svelte";

      type LayoutMode = "atlas" | "cinematic";
      let { layoutMode, sequence }: {
        layoutMode: LayoutMode;
        sequence: SequenceData;
      } = $props();
      const firstBeat = $derived(sequence.steps[0]);
      const sources = {
        vtg: "https://noelyee.com/instruction/vulcan-tech-gospel",
        qft: "https://www.drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation",
        lorq: "https://sirlorq.wordpress.com/2014/07/16/144-shape-matrix-even-petaled-flowers-rework/",
        poiNotation: "https://github.com/tiffanyfong/PoiNotation",
      };
    </script>

    <main class="study-container">
      <article class="notation-study" data-layout={layoutMode}>
        <header class="study-hero">
          <div class="hero-title">
            <p class="eyebrow">A movement language</p>
            <h1>Flow Arts Notation</h1>
            <p class="subtitle">The family of systems for writing movement down</p>
          </div>
          <div class="hero-thesis">
            <p>Writing down what a body does with two spinning props is an old problem, and more than one craft has taken a run at it.</p>
            <p>This study compares what each system puts on the page and where The Kinetic Alphabet sits among them.</p>
          </div>
        </header>
        <section class="rosetta-section">
          <span class="section-kicker">Three notation languages, three views</span>
          <h2>What each system puts on the page</h2>
          {#if firstBeat}
            <NotationRosetta pictograph={firstBeat} />
          {/if}
        </section>
        <section class="lineage-section">
          <header class="section-heading">
            <span class="section-kicker">How spinners mapped it</span>
            <h2>Four takes on the same problem</h2>
          </header>
          <div class="lineage-copy lineage-vtg">
            <h3>Relationship</h3>
            <p>Vulcan Tech Gospel gave poi a shared vocabulary: together time against split time, same direction against opposite.</p>
            <a href={sources.vtg} target="_blank" rel="noopener noreferrer">Noel Yee on VTG</a>
          </div>
          <div class="lineage-copy lineage-qft">
            <h3>Position</h3>
            <p>Charlie Cushing mapped absolute position around a numbered circle, then carried the idea onto a three by three grid.</p>
            <a href={sources.qft} target="_blank" rel="noopener noreferrer">Beginner's guide to QFT</a>
          </div>
          <div class="lineage-copy lineage-lorq">
            <h3>Combinations</h3>
            <p>Lorq Nichols charted twelve left-hand driving styles against twelve right-hand styles, laying out 144 pairings.</p>
          </div>
          <div class="lineage-copy lineage-code">
            <h3>Executable notation</h3>
            <p>PoiNotation treated a move as properties and a sequence as moves joined by operators that rendered into two poi simulators.</p>
            <a href={sources.poiNotation} target="_blank" rel="noopener noreferrer">PoiNotation on GitHub</a>
          </div>
        </section>
        <section class="matrix-section">
          <NotationShapeMatrix />
          <div class="matrix-copy">
            <span class="section-kicker">A field of combinations</span>
            <h2>The 144 Shape Matrix</h2>
            <p>Matched styles sit on the diagonal. Every off-diagonal cell combines two different driving styles into a hybrid.</p>
            <a href={sources.lorq} target="_blank" rel="noopener noreferrer">144 Shape Matrix, Sir Lorq</a>
          </div>
        </section>
        <section class="synthesis-section">
          <span class="section-kicker">Where TKA fits</span>
          <h2>What The Kinetic Alphabet adds</h2>
          <p>TKA draws a pictograph for every beat on a grid of up to nine points, so one image holds position, timing, and direction at once.</p>
          <p>String the beats together and they spell a word another spinner can read back without watching the move first.</p>
        </section>
        <section class="sequence-section">
          <span class="section-kicker">Read it, then play it</span>
          <h2>A sequence on the page and in motion</h2>
          <NotationSequenceStage {sequence} />
        </section>
        <section class="cta-card">
          <h2>Ready to create?</h2>
          <p>Build a sequence beat by beat in Flow Arts Composer.</p>
          <a href="/create">Open Flow Arts Composer</a>
        </section>
      </article>
    </main>

The only conditional is the firstBeat safety guard. Never branch on layoutMode. Preserve the exact historical claims and source URLs above, one h1, ordered h2 headings, and real anchors.

Add component-scoped CSS with these exact composition rules:

- .study-container declares container: notation-study / inline-size.
- Base is one column with width min(100%, 176rem), viewport-relative gutters, and prose capped near 46rem.
- At @container notation-study (min-width: 96rem), both modes use a 12-column grid.
- Atlas splits the hero 4/8; Rosetta and sequence span 12; lineage uses two columns; matrix and copy use 7/5.
- Cinematic centers hero and prose on columns 4 through 10; Rosetta, matrix, and sequence span 1 through 13.
- Section rules use theme strokes. Content panels use var(--theme-panel-bg) without blur.
- Links have visible focus-visible outlines.
- Route transitions stop under prefers-reduced-motion.

- [ ] **Step 4: Verify GREEN, format, and commit**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts
  pnpm exec prettier --write tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/\_components/NotationLayoutStudy.svelte
  git add -- tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/\_components/NotationLayoutStudy.svelte
  git commit -m "feat(notation): add atlas and cinematic compositions"

Expected: 4 tests pass.

### Task 4: Native route control and marketing chrome

**Files:**

- Modify: tests/unit/notation-4k-layout-contract.test.ts
- Create: src/routes/test/notation-4k/+page.svelte

**Interfaces:**

- Owns layoutMode with Svelte 5 state.
- Passes the same sequence and mode into one NotationLayoutStudy.
- Renders the existing SegmentedControl and MarketingChrome.

- [ ] **Step 1: Add the failing route contract**

  it("uses native chrome and controls without duplicating the study", () => {
  const source = read("src/routes/test/notation-4k/+page.svelte");
  expect(source).toContain(
  'import MarketingChrome from "$lib/shared/landing/components/MarketingChrome.svelte"'
      );
      expect(source).toContain(
        'import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte"'
  );
  expect(source.match(/<NotationLayoutStudy\b/g)).toHaveLength(1);
  expect(source).toContain('let layoutMode = $state<LayoutMode>("atlas")');
  expect(source).toContain('content="noindex, nofollow"');
  expect(source).toContain("value={layoutMode}");
  });

- [ ] **Step 2: Run the new test and verify RED**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts -t "uses native chrome"

Expected: FAIL because +page.svelte is absent.

- [ ] **Step 3: Implement the route**

    <script lang="ts">
      import MarketingChrome from "$lib/shared/landing/components/MarketingChrome.svelte";
      import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte";
      import demoJson from "$lib/shared/landing/data/demo-sequence.json";
      import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
      import NotationLayoutStudy from "./_components/NotationLayoutStudy.svelte";

      type LayoutMode = "atlas" | "cinematic";
      const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
        { value: "atlas", label: "Editorial Atlas" },
        { value: "cinematic", label: "Cinematic Runway" },
      ];
      const heroDemoSequence = demoJson as unknown as SequenceData;
      let layoutMode = $state<LayoutMode>("atlas");
    </script>

  <svelte:head>
  <title>Notation 4K Layout Lab</title>
  <meta name="robots" content="noindex, nofollow" />
  </svelte:head>

    <MarketingChrome>
      <div class="lab-shell">
        <aside class="layout-control" aria-label="Choose a notation layout">
          <span class="control-label">4K composition</span>
          <SegmentedControl options={layoutOptions} value={layoutMode}
            onchange={(value) => (layoutMode = value)} color="accent" />
        </aside>
        <NotationLayoutStudy {layoutMode} sequence={heroDemoSequence} />
      </div>
    </MarketingChrome>

Add component-scoped styles for a sticky control below the fixed site header, maximum control width near 32rem, theme fallbacks required by SegmentedControl, and a non-obscuring z-index. Do not import production notation CSS.

- [ ] **Step 4: Run the full contract and verify GREEN**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts

Expected: 5 tests pass.

- [ ] **Step 5: Format and commit**

  pnpm exec prettier --write tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/+page.svelte
  git add -- tests/unit/notation-4k-layout-contract.test.ts src/routes/test/notation-4k/+page.svelte
  git commit -m "feat(notation): add native 4k layout lab route"

### Task 5: Verification and handoff

**Files:** Modify only if verification exposes a harness-owned defect.

- [ ] **Step 1: Run focused automated verification**

  pnpm test --run tests/unit/notation-4k-layout-contract.test.ts
  pnpm exec prettier --check tests/unit/notation-4k-layout-contract.test.ts "src/routes/test/notation-4k/\*_/_.svelte"
  git diff --check main...HEAD

Expected: 5 tests pass, formatting is clean, and diff check prints nothing.

- [ ] **Step 2: Run package and Svelte diagnostics**

  pnpm build:packages
  pnpm check

Expected: package build passes. The harness adds no diagnostics. If the full checker again exceeds five minutes or reports inherited composer-wings diagnostics, run a focused build and report that limitation exactly.

- [ ] **Step 3: Verify route availability without browser control**

  Invoke-WebRequest -UseBasicParsing "http://localhost:5173/test/notation-4k" |
  Select-Object StatusCode

Expected: 200 only if port 5173 serves this worktree. Never stop or replace the user's server. Use an allowed secondary port 5174 only when required.

- [ ] **Step 4: Request browser permission for visual proof**

Ask before Chrome DevTools use. Once granted, verify both modes at large-screen width, toggle behavior, overflow, focus treatment, console messages, and stable player geometry.

- [ ] **Step 5: Run final Git review**

  git status --short --branch
  git log --oneline main..HEAD
  git diff --stat main...HEAD
  git diff --name-only main...HEAD

Expected: only the design spec, this plan, the contract test, and /test/notation-4k files differ from main.
