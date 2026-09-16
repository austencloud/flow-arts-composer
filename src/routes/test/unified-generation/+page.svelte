<!--
  Interactive prototype — Unified Generation as the Generate BENTO CARD GRID
  Design review gate for docs/superpowers/specs/active/2026-05-31-unified-generation-vocabulary-design.md

  Reuses the REAL generate cards (BaseCard / ToggleCard / StepperCard) and the real
  card-colors gradients, laid out 6-col like CardBasedSettingsContainer. Carries the deck
  vocabulary: WORD (type a word -> deck of all its variations), DECK SIZE, STEP COUNT, LEVEL,
  GRID, ORIENTATION, CUSTOMIZE, LOOP (pick any loop type), PERIOD, and a GENERATE/Draw button.

  Draw is a deterministic mock driven by the spec's real sfc32 seed. No engine wiring (Phase 2).
-->
<script lang="ts">
  import BaseCard from "$lib/features/create/generate/components/cards/BaseCard.svelte";
  import StepperCard from "$lib/features/create/generate/components/cards/StepperCard/StepperCard.svelte";
  import { getCardColors } from "$lib/shared/create/domain/card-colors";
  import { BackgroundType } from "@austencloud/backgrounds";
  import LOOPExpandedOverlay from "$lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte";
  import { LOOPType, LOOP_TYPE_LABELS, ROTATED_LOOP_TYPES } from "$lib/features/create/generate/circular/domain/models/circular-models";
  import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
  import type { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import TurnIntensityCard from "$lib/features/create/generate/components/cards/TurnIntensityCard.svelte";
  import { startPlacementManager } from "$lib/shared/create/services/start-placement-manager";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import OrientationCycler from "$lib/features/create/construct/start-placement-picker/components/OrientationCycler.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  const c = getCardColors(BackgroundType.COSMIC); // DEFAULT_COLORS gradients
  const LOOP_COLOR = "linear-gradient(135deg, #a3a32a 0%, #8a8a22 50%, #6b6b1a 100%)";
  const LOOP_SHADOW = "60deg 55% 35%";

  // Props/Hands/Dashes as 3-position steppers (Smooth→Mixed→Choppy).
  const TRI = ["smooth", "mixed", "choppy"] as const;
  const TRI_LABEL = ["Smooth", "Mixed", "Choppy"];
  const DASH = ["low", "mixed", "high"] as const;
  const DASH_LABEL = ["Low", "Mixed", "High"];
  function stepArr<T extends string>(arr: readonly T[], cur: T, dir: number): T {
    return arr[Math.max(0, Math.min(arr.length - 1, arr.indexOf(cur) + dir))]!;
  }
  // Deck size = preset choice, not a 1-by-1 dial. These decks get PRINTED (poker 2.5x3.5,
  // MPC pipeline), so stops are print-run-friendly. 52 = standard deck (default anchor),
  // 54 = +2 jokers, 36 = small run, 72 = double pack. Retune freely.
  const DECK_PRESETS = [36, 52, 54, 72];
  const STYLE_COLORS = {
    props: { color: c.continuity.color, shadow: c.continuity.shadowColor },
    hands: { color: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)", shadow: "245deg 70% 55%" },
    dashes: { color: "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #ea580c 100%)", shadow: "25deg 90% 55%" },
  };

  // ---- seeding (spec's chosen algorithm, shown live) -------------------------
  function cyrb128(str: string): [number, number, number, number] {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }
  function sfc32(a: number, b: number, c2: number, d: number): () => number {
    return () => {
      a >>>= 0; b >>>= 0; c2 >>>= 0; d >>>= 0;
      let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c2 + (c2 << 3)) | 0;
      c2 = (c2 << 21) | (c2 >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c2 = (c2 + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function mintSeed(): string {
    const buf = new Uint32Array(2); crypto.getRandomValues(buf);
    return buf[0]!.toString(16).padStart(8, "0") + buf[1]!.toString(16).padStart(8, "0");
  }

  // Base LOOP seeds that close for a (type, stepCount). Finite & computable, but nonzero for
  // every valid length — generation produces these FRESH; it never draws from a fixed store.
  function loopFactor(lt: LOOPType): number { return ROTATED_LOOP_TYPES.has(lt) ? 1 : 0.6; }
  function baseLoops(step: number, lt: LOOPType): number {
    return Math.max(6, Math.round(Math.pow(step / 2, 3) * 4 * loopFactor(lt)));
  }

  let word = $state("");
  let wordEditing = $state(false);
  let deckSize = $state(52);
  let stepCount = $state(8);
  let level = $state(1);
  let loopType = $state<LOOPType>(LOOPType.ROTATED);
  let loopComponents = $state<Set<LOOPComponent>>(parseLoopComponents(LOOPType.ROTATED));
  let showLoop = $state(false);
  let period = $state<"quartered" | "halved">("quartered");
  let turnIntensity = $state(1); // max turn intensity — generator model; appears at Level 2+
  let propRev = $state<"smooth" | "mixed" | "choppy">("smooth");
  let handRev = $state<"smooth" | "mixed" | "choppy">("mixed");
  let dashes = $state<"low" | "mixed" | "high">("mixed");
  let seed = $state(mintSeed());
  let wordInputEl = $state<HTMLInputElement | null>(null);
  $effect(() => { if (wordEditing && wordInputEl) wordInputEl.focus(); });

  // Start Position & Orientation — deck wants a SUBSET (a deck draws from many start
  // positions), so this is MULTI-select, unlike Construct's single-pick. Content-driven grid
  // reusing PictographContainer + OrientationCycler + startPlacementManager (the same data).
  // Grid mode lives here too, so the standalone Grid toggle tile is gone.
  let showPosOri = $state(false);
  let posGridMode = $state<GridMode>(GridMode.DIAMOND);
  let posLeftOri = $state<Orientation>(Orientation.IN);
  let posRightOri = $state<Orientation>(Orientation.IN);
  let posShowAll = $state(false); // false = Classic 3, true = all 16 variations
  let selectedPositions = $state<Set<string>>(new Set());
  const oriShort = (o: Orientation): string =>
    ({ [Orientation.IN]: "In", [Orientation.OUT]: "Out", [Orientation.CLOCK]: "Clock", [Orientation.COUNTER]: "Counter" } as Record<string, string>)[o] ?? String(o);

  const posList = $derived<PictographData[]>(
    posShowAll
      ? startPlacementManager.getAllStartPlacementVariations(posGridMode, posLeftOri, posRightOri)
      : startPlacementManager.getDefaultStartPlacements(posGridMode, posLeftOri, posRightOri),
  );
  function togglePosition(id: string) {
    const next = new Set(selectedPositions);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedPositions = next;
  }
  function selectAllPositions() { selectedPositions = new Set(posList.map((p) => p.id)); }
  function clearPositions() { selectedPositions = new Set(); }
  function pickClassic3() {
    posShowAll = false;
    selectedPositions = new Set(
      startPlacementManager.getDefaultStartPlacements(posGridMode, posLeftOri, posRightOri).map((p) => p.id),
    );
  }

  // Deck Prop: reuse the real BentoPropGrid (props by family). The deck's prop is part of the
  // recipe — it overrides the user's saved global prop setting at generation time.
  let propType = $state<PropType>(PropType.STAFF);
  let showProp = $state(false);
  const propLabel = $derived(propType.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()));

  const wordMode = $derived(word.trim().length > 0);
  // Generation fans each base seed across the variation axes → the real card space is deep.
  const turnAllowed = $derived(level >= 3 ? [0, 0.5, 1, 1.5, 2, 2.5, 3] : [0, 1, 2, 3]);
  const variationMultiplier = $derived(
    (level > 1 && turnIntensity > 0 ? 4 : 1) * (period === "quartered" ? 2 : 1) *
    (propRev === "smooth" ? 1 : 2) * (handRev === "smooth" ? 1 : 2),
  );
  const wordVariations = $derived(wordMode ? Math.max(1, word.trim().length * 6) * variationMultiplier : 0);
  const cardSpace = $derived(wordMode ? wordVariations : baseLoops(stepCount, loopType) * variationMultiplier);
  const requested = $derived(wordMode ? wordVariations : deckSize); // word deck = ALL variations
  const drawCount = $derived(Math.min(requested, cardSpace));
  // Rare: only when you ask for more UNIQUE cards than the entire variation space holds.
  const exhausted = $derived(requested > cardSpace);

  const periodLabel = $derived(period === "quartered" ? "Quartered" : "Halved");
  const gridLabel = $derived(posGridMode === GridMode.DIAMOND ? "Diamond" : "Box");
  const posOriSummary = $derived.by(() => {
    const ori = posLeftOri === posRightOri ? oriShort(posLeftOri) : `${oriShort(posLeftOri)}/${oriShort(posRightOri)}`;
    const n = selectedPositions.size;
    const posPart = n === 0 ? "Any pos" : `${n} pos`;
    return `${posPart} · ${gridLabel} · ${ori}`;
  });

  const recipe = $derived({
    schemaVersion: 1, generatorVersion: "loop-gen@0.1.0", seed,
    params: {
      ...(wordMode ? { word: word.trim().toUpperCase(), deck: "all-variations" } : { deckSize }),
      loopType, stepCount, level, period, prop: propType,
      grid: posGridMode === GridMode.DIAMOND ? "diamond" : "box",
      startPlacements: selectedPositions.size === 0 ? "any" : Array.from(selectedPositions),
      leftOrientation: posLeftOri, rightOrientation: posRightOri,
      propReversals: propRev, handReversals: handRev, dashes,
      ...(level > 1 ? { turnIntensity } : {}),
    },
  });

  const drawPreview = $derived.by(() => {
    const [a, b, cc, d] = cyrb128(JSON.stringify(recipe));
    const rand = sfc32(a, b, cc, d);
    const n = Math.min(drawCount, 24);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = Math.floor(rand() * Math.max(1, cardSpace)).toString(36).toUpperCase().padStart(4, "0");
      out.push(wordMode ? `${word.trim().slice(0, 3).toUpperCase()}·${id}` : `${loopType.slice(0, 3)}-${stepCount}-${id}`);
    }
    return out;
  });

  let copied = $state(false);
  async function copyRecipe() {
    try { await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2)); copied = true; setTimeout(() => (copied = false), 1600); }
    catch (e) { console.error(e); }
  }
  function generate() { seed = mintSeed(); }
  function cycleDeck() { deckSize = DECK_PRESETS[(DECK_PRESETS.indexOf(deckSize) + 1) % DECK_PRESETS.length] ?? 52; }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
</script>

<svelte:head><title>Unified Generation — Bento Grid Prototype</title></svelte:head>

<div class="harness">
  <header class="topbar">
    <span class="badge">Deck Generator</span>
    <p class="ctx-note">Generate a deck the way you generate a sequence. {#if wordMode}<strong>Word mode:</strong> drawing every variation of “{word.trim().toUpperCase()}”.{:else}Pick dials → <strong>Generate</strong> draws {drawCount}.{/if}</p>
  </header>
  <div class="mock-banner"><i class="fas fa-flask"></i> Counts are <strong>illustrative placeholders</strong>, not computed. Real enumeration (closed-form ceiling) is Phase&nbsp;0/2. This prototype is for layout & feel.</div>

  <div class="layout">
    <section class="grid-pane">
      <div class="grid-stage">
      <div class="card-grid">
        <!-- Row 1 -->
        <div class="tile" style:view-transition-name="t-word">
        {#if wordEditing}
          <div class="word-edit" style="--c: {c.mode.color}">
            <span class="we-label">Word</span>
            <input
              class="we-input"
              bind:this={wordInputEl}
              placeholder="A–Z"
              bind:value={word}
              onblur={() => (wordEditing = false)}
              onkeydown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
        {:else}
          <BaseCard title="Word" currentValue={wordMode ? word.trim().toUpperCase() : "A–Z"} color={c.mode.color} shadowColor={c.mode.shadowColor} gridColumnSpan={2} onClick={() => (wordEditing = true)} />
        {/if}
        </div>

        <div class="tile" style:view-transition-name="t-deck">
        {#if wordMode}
          <BaseCard title="Deck" currentValue={`${drawCount} vars`} color={c.favorite.color} shadowColor={c.favorite.shadowColor} gridColumnSpan={2} clickable={false} />
        {:else}
          <BaseCard title="Deck Size" currentValue={`${deckSize}`} color={c.favorite.color} shadowColor={c.favorite.shadowColor} gridColumnSpan={2} onClick={cycleDeck} />
        {/if}
        </div>

        <div class="tile" style:view-transition-name="t-length">
        <StepperCard title="Length" currentValue={stepCount} minValue={4} maxValue={16} description="STEP COUNT" color={c.length.color} shadowColor={c.length.shadowColor} gridColumnSpan={2} onIncrement={() => (stepCount = clamp(stepCount + 2, 4, 16))} onDecrement={() => (stepCount = clamp(stepCount - 2, 4, 16))} />
        </div>

        <!-- Row 2 -->
        <div class="tile" style:view-transition-name="t-level">
        <StepperCard title="Level" currentValue={level} minValue={1} maxValue={4} description="BASE MOTIONS" color={c.level.color} shadowColor={c.level.shadowColor} gridColumnSpan={2} onIncrement={() => (level = clamp(level + 1, 1, 4))} onDecrement={() => (level = clamp(level - 1, 1, 4))} />
        </div>

        <div class="tile">
        <BaseCard title="Prop" currentValue={propLabel} color={c.gridMode.color} shadowColor={c.gridMode.shadowColor} gridColumnSpan={2} onClick={() => (showProp = true)} />
        </div>

        <div class="tile">
        <BaseCard title="Pos & Ori" currentValue={posOriSummary} color={c.duration.color} shadowColor={c.duration.shadowColor} gridColumnSpan={2} onClick={() => (showPosOri = true)} />
        </div>

        <!-- Loop now also carries Period (chosen together in the loop modal). -->
        <div class="tile">
        <BaseCard title="Loop" currentValue={`${LOOP_TYPE_LABELS[loopType]} · ${periodLabel}`} color={LOOP_COLOR} shadowColor={LOOP_SHADOW} gridColumnSpan={2} onClick={() => (showLoop = true)} />
        </div>

      </div>

      <!-- Style row in its OWN flex container so the Turns tile can never wrap onto the dials
           rows (that caused the row-2 flash). The collapse morph stays inside this row. -->
      <div class="card-grid style-row">
        <div class="tile turns" class:collapsed={level <= 1} aria-hidden={level <= 1}>
        <TurnIntensityCard currentIntensity={turnIntensity} allowedValues={turnAllowed} onIntensityChange={(v: number) => (turnIntensity = v)} shadowColor="140deg 70% 45%" gridColumnSpan={2} />
        </div>

        <div class="tile">
        <StepperCard title="Props" currentValue={TRI.indexOf(propRev)} minValue={0} maxValue={2} description="REVERSALS" formatValue={(i: number) => TRI_LABEL[i] ?? ""} color={STYLE_COLORS.props.color} shadowColor={STYLE_COLORS.props.shadow} gridColumnSpan={2} onIncrement={() => (propRev = stepArr(TRI, propRev, 1))} onDecrement={() => (propRev = stepArr(TRI, propRev, -1))} />
        </div>
        <div class="tile">
        <StepperCard title="Hands" currentValue={TRI.indexOf(handRev)} minValue={0} maxValue={2} description="REVERSALS" formatValue={(i: number) => TRI_LABEL[i] ?? ""} color={STYLE_COLORS.hands.color} shadowColor={STYLE_COLORS.hands.shadow} gridColumnSpan={2} onIncrement={() => (handRev = stepArr(TRI, handRev, 1))} onDecrement={() => (handRev = stepArr(TRI, handRev, -1))} />
        </div>
        <div class="tile">
        <StepperCard title="Dashes" currentValue={DASH.indexOf(dashes)} minValue={0} maxValue={2} description="FREQUENCY" formatValue={(i: number) => DASH_LABEL[i] ?? ""} color={STYLE_COLORS.dashes.color} shadowColor={STYLE_COLORS.dashes.shadow} gridColumnSpan={2} onIncrement={() => (dashes = stepArr(DASH, dashes, 1))} onDecrement={() => (dashes = stepArr(DASH, dashes, -1))} />
        </div>
      </div>

      <!-- Generate — full width, its own row below both grids -->
      <button class="generate" onclick={generate}>
        <i class="fas fa-dice"></i>
        <span>{wordMode ? `Generate ${drawCount} variations` : `Generate ${drawCount}`}</span>
      </button>
      </div>
    </section>

    <aside class="rail">
      <div class="stat">
        <div class="stat-big" class:warn={exhausted}>{drawCount}</div>
        <div class="stat-sub">{wordMode ? "variations of the word" : "fresh cards"}<span class="mocktag">illustrative — not computed</span></div>
      </div>

      <div class="recipe-head"><span>Recipe (durable truth)</span><button class="copy" onclick={copyRecipe}>{copied ? "Copied!" : "Copy"}</button></div>
      <pre class="recipe"><code>{JSON.stringify(recipe, null, 2)}</code></pre>

      <div class="draw-head">Draw preview <span class="seed-tag">seed {seed.slice(0, 8)}…</span></div>
      <div class="draw-list">{#each drawPreview as id}<span class="draw-id">{id}</span>{/each}</div>
    </aside>
  </div>

  <!-- Big centered modals (deck releaser owns the full viewport). -->
  {#if showLoop}
    <div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showLoop = false; }}>
      <div class="loop-col" transition:scale={{ start: 0.95, duration: 250, easing: quintOut }}>
        <div class="loop-host">
          <LOOPExpandedOverlay
            currentType={loopType}
            selectedComponents={loopComponents}
            onChange={(lt: LOOPType) => { loopType = lt; loopComponents = parseLoopComponents(lt); showLoop = false; }}
            onClose={() => (showLoop = false)}
          />
        </div>
        <!-- Period chosen alongside the loop; it shows on the Loop card. -->
        <div class="loop-period">
          <span class="lp-label">Period</span>
          <div class="lp-seg">
            <SegmentedControl
              options={[{ value: "quartered", label: "Quartered" }, { value: "halved", label: "Halved" }]}
              value={period}
              onchange={(v: "quartered" | "halved") => (period = v)}
              color="accent"
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showPosOri}
    <div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showPosOri = false; }}>
      <div class="picker-overlay posori" transition:scale={{ start: 0.95, duration: 250, easing: quintOut }}>
        <div class="po-header">
          <h3>Start Positions &amp; Orientation</h3>
          <button class="po-close" aria-label="Close" onclick={() => (showPosOri = false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Controls: presets, scope toggle (Simple/All), grid mode — one tidy row -->
        <div class="pos-controls">
          <div class="pos-presets">
            <button class="pc-btn" onclick={() => { posShowAll = true; selectAllPositions(); }}>All</button>
            <button class="pc-btn" onclick={pickClassic3}>Classic 3</button>
            <button class="pc-btn" onclick={clearPositions}>Clear</button>
          </div>
          <button class="pc-btn pc-scope" class:active={posShowAll} onclick={() => (posShowAll = !posShowAll)}>
            {posShowAll ? "Simple (3)" : "All Variations (16)"}
          </button>
          <div class="pos-gridmode">
            <SegmentedControl
              options={[{ value: GridMode.DIAMOND, label: "Diamond" }, { value: GridMode.BOX, label: "Box" }]}
              value={posGridMode}
              onchange={(v: GridMode) => { posGridMode = v; }}
              color="accent"
              size="sm"
            />
          </div>
        </div>

        <!-- Multi-select position grid (tap to toggle which positions the deck draws from).
             Advanced (16) view is locked to a 4×4 grid sized to fit without scrolling. -->
        <div class="po-body" class:all={posShowAll}>
          <div class="pos-grid" class:all={posShowAll}>
            {#each posList as p (p.id)}
              <button
                class="pos-cell"
                class:on={selectedPositions.has(p.id)}
                aria-pressed={selectedPositions.has(p.id)}
                onclick={() => togglePosition(p.id)}
              >
                <PictographContainer pictographData={p} />
                {#if selectedPositions.has(p.id)}<span class="pos-check">✓</span>{/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Per-hand orientation -->
        <div class="pos-ori-row">
          <OrientationCycler orientation={posLeftOri} onOrientationChange={(o: Orientation) => (posLeftOri = o)} color="blue" />
          <OrientationCycler orientation={posRightOri} onOrientationChange={(o: Orientation) => (posRightOri = o)} color="red" />
        </div>

        <button class="po-done" onclick={() => (showPosOri = false)}>
          Done{#if selectedPositions.size > 0} · {selectedPositions.size} selected{/if}
        </button>
      </div>
    </div>
  {/if}

  {#if showProp}
    <div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showProp = false; }}>
      <div class="picker-overlay" transition:scale={{ start: 0.95, duration: 250, easing: quintOut }}>
        <div class="po-header">
          <h3>Deck Prop</h3>
          <button class="po-close" aria-label="Close" onclick={() => (showProp = false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="po-body">
          <BentoPropGrid selectedPropType={propType} variant="inline" title="Select Prop" onSelect={(p: PropType) => { propType = p; showProp = false; }} />
        </div>
        <button class="po-done" onclick={() => (showProp = false)}>Done</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .harness {
    min-height: 100vh; padding-bottom: 60px; color: #f5f5f5;
    background: radial-gradient(circle at 30% 12%, #16203a, #0a0d18 70%);
    /* theme vars the real cards read */
    --theme-text: #f5f5f5; --theme-stroke: rgba(255, 255, 255, 0.2);
    --theme-stroke-strong: rgba(255, 255, 255, 0.3); --theme-shadow: rgba(0, 0, 0, 0.35);
    --theme-card-bg: rgba(255, 255, 255, 0.06); --theme-accent: #818cf8; --theme-accent-strong: #6366f1;
    --semantic-success: #22c55e; --semantic-info: #3b82f6; --semantic-warning: #f59e0b;
    --min-touch-target: 44px;
    --duration-instant: 90ms; --duration-fast: 150ms; --duration-normal: 220ms;
    --duration-emphasis: 300ms; --duration-dramatic: 450ms;
    --card-text-size: 22px; --card-text-weight: 800; --card-text-spacing: 0.3px;
    --card-text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45); --element-spacing: 10px;
  }
  .topbar {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    padding: 14px 28px; background: rgba(10, 13, 24, 0.9); backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .badge { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #06121a; background: #22c55e; padding: 5px 12px; border-radius: 999px; }
  .ctx-note { margin: 0; font-size: 13px; color: rgba(255, 255, 255, 0.65); }
  .ctx-note strong { color: #22c55e; }
  .mock-banner { display: flex; align-items: center; gap: 8px; max-width: 1180px; margin: 12px auto 0; padding: 8px 28px; font-size: 12px; color: #fbbf24; }
  .mock-banner strong { color: #fbbf24; }
  .mocktag { color: #fbbf24; font-size: 11px; opacity: 0.85; }

  .layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.8fr); gap: 24px; max-width: 1180px; margin: 28px auto 0; padding: 0 28px; align-items: start; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

  .grid-pane { display: flex; flex-direction: column; gap: 14px; }
  .grid-stage { position: relative; display: flex; flex-direction: column; gap: 10px; }
  /* Flex-wrap, not fixed grid: whatever lands on the last row stretches to fill the
     width equally (3-up stretched when Turns is hidden, 4-up when it appears) — no holes
     at any tile count, and the reflow is the thing that can animate on add/remove. */
  .card-grid {
    display: flex; flex-wrap: wrap; align-content: flex-start;
    gap: 10px; width: 100%; margin: 0;
  }
  .card-grid > .tile {
    flex: 1 1 230px; min-width: 200px; height: 120px; min-height: 0;
  }
  .tile > :global(*) { width: 100%; height: 100%; }
  /* Generate spans the full width on its own row, below both grids. */
  .grid-stage > .generate { width: 100%; height: auto; min-height: 92px; }

  @media (min-width: 1700px) { .layout { max-width: 1700px; } }

  /* Max Turns morph: always mounted. Animating its flex-basis 230->0 makes the row
     re-flow live every frame, so the sibling style tiles shrink/grow their REAL width
     with crisp content — no bitmap cross-fade, no remount. */
  .tile.turns {
    min-width: 0; overflow: hidden;
    transition: flex-basis 340ms cubic-bezier(0.4, 0, 0.2, 1),
                flex-grow 340ms cubic-bezier(0.4, 0, 0.2, 1),
                margin-right 340ms cubic-bezier(0.4, 0, 0.2, 1),
                opacity 240ms ease;
  }
  .tile.turns.collapsed {
    flex: 0 0 0; opacity: 0; pointer-events: none;
    margin-right: -10px; /* cancel the grid gap left by the zero-width tile */
  }
  @media (prefers-reduced-motion: reduce) {
    .tile.turns { transition-duration: 0.001ms; }
  }

  /* Unify typography across BaseCard / StepperCard / ToggleCard.
     Each component sized its value text differently (stepper up to 60px, base 22px,
     toggle option clamp 11–28px). Normalize to one hierarchy:
       single-value text (stepper number + base value) → 24px
       toggle option labels (two stacked) → 17px
       card headers (GRID, PROPS, …) → 11px */
  .card-grid :global(.value-number),
  .card-grid :global(.base-card .card-value) { font-size: 24px !important; line-height: 1.15 !important; }
  .card-grid :global(.option-label) { font-size: 17px !important; }
  .card-grid :global(.card-title) { font-size: 11px !important; letter-spacing: 0.8px !important; }

  /* word edit tile mirrors the base-card look while typing */
  .word-edit {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    border-radius: 16px; background: var(--c); padding: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }
  .we-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255, 255, 255, 0.85); }
  .we-input {
    width: 100%; background: rgba(0, 0, 0, 0.25); border: 1.5px solid rgba(255, 255, 255, 0.3);
    border-radius: 10px; color: #fff; font-size: 20px; font-weight: 700; letter-spacing: 1.5px;
    text-align: center; text-transform: uppercase; padding: 8px; outline: none;
  }
  .we-input:focus { border-color: rgba(255, 255, 255, 0.6); }

  .generate {
    display: flex; align-items: center; justify-content: center; gap: 12px; border: none; cursor: pointer;
    border-radius: 20px; color: #fff; font-size: 24px; font-weight: 800; letter-spacing: 0.3px;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
    background: linear-gradient(135deg, color-mix(in srgb, #22c55e 85%, #065f46) 0%, #22c55e 25%, color-mix(in srgb, #22c55e 100%, #a7f3d0) 50%, #22c55e 75%, color-mix(in srgb, #22c55e 85%, #065f46) 100%);
    box-shadow: 0 4px 14px color-mix(in srgb, #22c55e 45%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.4);
    transition: transform 200ms, filter 200ms;
  }
  .generate:hover { filter: brightness(1.12) saturate(1.1); transform: scale(1.01); }
  .generate:active { transform: scale(0.985); }
  .generate i { font-size: 22px; }

  /* Deck releaser owns the full viewport (4K), so pickers are BIG centered modals,
     not grid-confined overlays. Backdrop dims the page; panel centers and goes large. */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    padding: clamp(16px, 4vh, 48px);
    background: rgba(4, 7, 14, 0.62); backdrop-filter: blur(5px);
  }
  /* Centered, large picker panel — matches LOOPExpandedOverlay's theme chrome. */
  .picker-overlay {
    width: min(1080px, 94vw); max-height: min(880px, 90vh);
    display: flex; flex-direction: column; gap: 12px; padding: 16px;
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 25%, #1a1a2e) 0%,
      color-mix(in srgb, var(--theme-accent, #818cf8) 15%, #1a1a2e) 50%,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 20%, #1a1a2e) 100%);
    border-radius: 18px; border: 2px solid color-mix(in srgb, var(--theme-accent) 50%, transparent);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55), 0 0 40px color-mix(in srgb, var(--theme-accent) 28%, transparent);
    overflow: hidden;
  }
  /* Pos & Ori: DEFINITE-height modal (not just max-height) so the advanced 4×4 grid never
     scrolls. The grid's width is capped to the body's container height (100cqh), so the body
     MUST have a definite height that doesn't itself depend on the grid — otherwise width and
     height chase each other in a circle and the grid collapses. A fixed modal height makes
     .po-body's flex:1 height a stable external budget that 100cqh resolves against.
     Budget: header ~34 + controls ~38 + ori row ~38 + done ~46, four 14px gaps (56) and
     16px×2 padding (32) ≈ 244px of chrome. At 720px tall that leaves ~476px for .po-body,
     and a square 4×4 grid capped to (476 − 30) = 446px fits inside it with room to spare. */
  .picker-overlay.posori { width: min(720px, 94vw); height: min(720px, 90vh); gap: 14px; }
  .pos-controls {
    flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px;
  }
  .pos-presets { display: flex; gap: 6px; }
  .pc-btn {
    height: 36px; padding: 0 14px; border-radius: 9px;
    background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16);
    color: var(--theme-text, #fff); font-size: 12.5px; font-weight: 600; line-height: 1; cursor: pointer;
    transition: background 150ms, border-color 150ms;
    display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;
  }
  .pc-btn:hover { background: rgba(255, 255, 255, 0.16); }
  .pc-scope {
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }
  .pc-scope.active {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 28%, transparent);
  }
  .pc-scope:hover { background: color-mix(in srgb, var(--theme-accent) 36%, transparent); }
  /* Diamond/Box: cap its width so the segmented control isn't a full-width bar, and lower the
     local touch-target floor so size="sm" reads as a compact pill, not a chunky 44px bar. */
  .pos-gridmode { width: clamp(150px, 38%, 200px); --min-touch-target: 34px; }

  /* The body is the flex remainder; the grid lives inside it, centered. Advanced view never
     scrolls — overflow hidden plus a height-capped grid guarantees 4×4 fits. */
  .po-body.all {
    overflow: hidden; display: flex; align-items: center; justify-content: center;
    container-type: size; /* establishes the cqh budget the advanced grid caps its width to */
  }

  .pos-grid {
    display: grid; gap: 10px; align-content: center; justify-content: center;
    width: 100%; margin: 0 auto;
  }
  /* Simple (3): three across. */
  .pos-grid:not(.all) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-width: 480px;
  }
  /* Advanced (16): exactly 4 columns × 4 rows, all visible, no scroll. Each cell is square
     (aspect-ratio 1/1), columns and rows both gap 10px. With 4 columns + 3 col-gaps,
     one cell = (W − 30) / 4, so the grid HEIGHT = 4·cell + 3·10 = (W − 30) + 30 = W — the
     equal col/row gaps cancel, so a square-celled 4×4 grid is exactly as tall as it is wide.
     Capping width at min(100%, body-height − 30) therefore caps height ≤ body height, so it
     never overflows at any viewport; on tall viewports it caps at 460px for sane cell size. */
  .pos-grid.all {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: min(100%, calc(100cqh - 30px), 460px);
  }
  .pos-cell {
    position: relative; aspect-ratio: 1 / 1; padding: 5px; cursor: pointer;
    background: rgba(0, 0, 0, 0.25); border: 2px solid transparent; border-radius: 12px;
    transition: border-color 150ms, transform 120ms; min-width: 0;
  }
  .pos-cell:hover { border-color: rgba(255, 255, 255, 0.3); }
  .pos-cell:active { transform: scale(0.97); }
  .pos-cell.on { border-color: var(--theme-accent, #6366f1); box-shadow: 0 0 14px color-mix(in srgb, var(--theme-accent) 40%, transparent); }
  .pos-cell :global(.pictograph),
  .pos-cell :global(.pictograph svg) { width: 100%; height: 100%; display: block; }
  .pos-check {
    position: absolute; top: 4px; right: 5px; width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800;
    color: #06121a; background: var(--theme-accent, #6366f1);
  }
  /* Orientation cyclers: compact, side by side. Lower the local touch-target floor so they
     read as tidy ~38px pills rather than the default 44–48px bars, and cap their height. */
  .pos-ori-row {
    flex-shrink: 0; display: flex; gap: 12px; justify-content: center;
    --min-touch-target: 38px;
  }
  .pos-ori-row :global(.orientation-cycler) {
    flex: 0 1 200px; min-height: 38px; border-radius: 10px;
  }

  /* Loop modal: let the overlay flow (not absolute) so the panel sizes to content —
     no dead space below the cards. Period footer sits beneath it. */
  .loop-col {
    width: min(1000px, 94vw); max-height: 92vh;
    display: flex; flex-direction: column; gap: 12px;
  }
  .loop-host { position: relative; min-height: 0; overflow: hidden; border-radius: 18px; }
  .loop-host :global(.loop-expanded-overlay) {
    position: relative !important; inset: auto !important;
    width: 100%; max-height: 82vh;
  }
  /* Let the loop grid size to its cards — no forced min-height (was 260px → dead space). */
  .loop-host :global(.grid-container) { flex: 0 0 auto; }
  .loop-period {
    flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 14px;
    padding: 10px 16px; background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 14px;
  }
  .lp-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.72); }
  /* Compact period toggle (mirrors .pos-gridmode): capped width, smaller touch floor. */
  .lp-seg { width: clamp(220px, 46%, 340px); --min-touch-target: 34px; }
  .po-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .po-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 0.3px; }
  .po-close {
    background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px;
    color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; padding: 8px;
  }
  .po-close svg { width: 20px; height: 20px; }
  .po-close:hover { background: rgba(255, 255, 255, 0.15); }
  .po-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .po-done {
    flex-shrink: 0; width: 100%; padding: 12px 20px; min-height: 44px;
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border: 2px solid var(--theme-accent); border-radius: 10px; color: #fff;
    font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
  }
  .po-done:hover { background: color-mix(in srgb, var(--theme-accent) 45%, transparent); }

  .rail { display: flex; flex-direction: column; gap: 14px; }
  .stat { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 18px; text-align: center; }
  .stat-big { font-size: 44px; font-weight: 800; color: #22c55e; font-variant-numeric: tabular-nums; line-height: 1; }
  .stat-big.warn { color: #fbbf24; }
  .stat-sub { margin-top: 8px; font-size: 12px; color: rgba(255, 255, 255, 0.55); display: flex; flex-direction: column; gap: 2px; }
  .recipe-head, .draw-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255, 255, 255, 0.5); }
  .copy { padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); background: none; color: #fff; font-size: 12px; cursor: pointer; }
  .recipe { margin: 0; max-height: 300px; overflow: auto; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 14px; font-size: 12px; line-height: 1.5; color: #cbd5e1; }
  .seed-tag { font-weight: 500; text-transform: none; color: #22c55e; font-variant-numeric: tabular-nums; }
  .draw-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .draw-id { font-size: 11px; font-family: ui-monospace, monospace; padding: 3px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.75); }
</style>
