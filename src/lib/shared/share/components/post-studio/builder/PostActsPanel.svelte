<script lang="ts">
  import type { PostBuilderState } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import {
    DEFAULT_FRAMING,
    POST_PLAN_MAX_ZOOM,
    POST_PLAN_MIN_ACT_SECONDS,
    POST_PLAN_MIN_ZOOM,
    type PerformanceAct,
    type PostAct,
    type PostFraming,
    type PostStrip,
  } from "$lib/shared/media-composition/domain/post-plan";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { formatTakeClock, parseClock } from "./post-builder-format";

  /**
   * One act at a time: which take it plays and which stretch of it, how
   * fast, how it is laid out, and how the footage sits in its frame. The
   * canvas shows the strip's outline while this step is open so the
   * framing can keep the props clear of it.
   */
  let { builder }: { builder: PostBuilderState } = $props();

  const acts = $derived(builder.plan.acts);
  const act = $derived(
    acts.find((entry) => entry.id === builder.selectedActId) ?? acts[0] ?? null
  );
  const compiledAct = $derived(
    builder.compiled?.acts.find((entry) => entry.actId === act?.id) ?? null
  );
  const takes = $derived(builder.plan.takes);
  const take = $derived(
    act?.kind === "performance"
      ? (takes.find((entry) => entry.id === act.takeId) ?? null)
      : null
  );

  /** The take moment under the post playhead, when it is inside this act. */
  const takeSecondsAtPlayhead = $derived.by(() => {
    const compiledNow = builder.currentAct;
    if (!compiledAct || compiledNow?.actId !== compiledAct.actId) return null;
    if (compiledAct.kind !== "performance") return null;
    return (
      compiledAct.sourceIn +
      (builder.previewSeconds - compiledAct.startSeconds) * compiledAct.speed
    );
  });

  const performanceSpan = $derived.by(() => {
    if (!take) return null;
    const resolved = builder.resolvedTiming(take.id);
    const landings = (resolved?.sections ?? []).flatMap((section) =>
      section.landings.filter(
        (landing) =>
          section.endPosition === null ||
          landing.position <= section.endPosition
      )
    );
    if (landings.length < 2) return null;
    const first = landings[0]!.seconds;
    const last = landings[landings.length - 1]!.seconds;
    return {
      sourceIn: Math.max(0, first - 0.75),
      sourceOut: Math.min(take.durationSeconds, last + 1),
    };
  });

  let inDraft = $state("");
  let outDraft = $state("");
  $effect(() => {
    if (act?.kind !== "performance") return;
    inDraft = formatTakeClock(act.sourceIn);
    outDraft = act.sourceOut === null ? "" : formatTakeClock(act.sourceOut);
  });

  function selectAct(actId: string): void {
    builder.pause();
    builder.selectedActId = actId;
    const compiled = builder.compiled?.acts.find(
      (entry) => entry.actId === actId
    );
    if (compiled) builder.seek(compiled.startSeconds + 0.05);
  }

  function edit(change: (act: PostAct) => PostAct): void {
    if (act) builder.updateAct(act.id, change);
  }

  function editPerformance(
    change: (act: PerformanceAct) => PerformanceAct
  ): void {
    edit((current) =>
      current.kind === "performance" ? change(current) : current
    );
  }

  function editFraming(change: Partial<PostFraming>): void {
    editPerformance((current) => ({
      ...current,
      framing: { ...current.framing, ...change },
    }));
  }

  function setIn(seconds: number): void {
    editPerformance((current) => {
      const limit =
        (current.sourceOut ?? take?.durationSeconds ?? Infinity) -
        POST_PLAN_MIN_ACT_SECONDS;
      return { ...current, sourceIn: Math.max(0, Math.min(seconds, limit)) };
    });
  }

  function setOut(seconds: number | null): void {
    editPerformance((current) => {
      if (seconds === null) return { ...current, sourceOut: null };
      const clamped = Math.min(
        take?.durationSeconds ?? seconds,
        Math.max(current.sourceIn + POST_PLAN_MIN_ACT_SECONDS, seconds)
      );
      return { ...current, sourceOut: clamped };
    });
  }

  function commitIn(): void {
    const seconds = parseClock(inDraft);
    if (seconds === null) {
      if (act?.kind === "performance") inDraft = formatTakeClock(act.sourceIn);
      return;
    }
    setIn(seconds);
  }

  function commitOut(): void {
    if (outDraft.trim() === "") {
      setOut(null);
      return;
    }
    const seconds = parseClock(outDraft);
    if (seconds === null) {
      if (act?.kind === "performance") {
        outDraft = act.sourceOut === null ? "" : formatTakeClock(act.sourceOut);
      }
      return;
    }
    setOut(seconds);
  }

  const SPEEDS = [
    { value: "1", label: "1×" },
    { value: "0.75", label: "¾×" },
    { value: "0.5", label: "½×" },
    { value: "0.25", label: "¼×" },
  ];
  const STRIPS: { value: PostStrip; label: string }[] = [
    { value: "off", label: "Off" },
    { value: "arrows", label: "Arrows" },
    { value: "mandala", label: "Trails" },
    { value: "alternate", label: "Both" },
  ];
</script>

<div class="acts">
  <SegmentedControl
    options={acts.map((entry) => ({
      value: entry.id,
      label: entry.enabled ? entry.label : `${entry.label} (off)`,
    }))}
    value={act?.id ?? ""}
    onchange={selectAct}
    size="sm"
    ariaLabel="Act"
  />

  {#if act}
    <label class="check">
      <input
        type="checkbox"
        checked={act.enabled}
        onchange={(event) =>
          edit((current) => ({
            ...current,
            enabled: event.currentTarget.checked,
          }))}
      />
      Include {act.label} in the post
    </label>

    {#if act.kind === "card"}
      <div class="group">
        <h3>The card</h3>
        <p class="help">The sequence card with its QR code, held at the end.</p>
        <label class="slider">
          <span>On screen for {act.seconds} s</span>
          <input
            type="range"
            min="1"
            max="30"
            step="0.5"
            value={act.seconds}
            oninput={(event) =>
              edit((current) =>
                current.kind === "card"
                  ? { ...current, seconds: Number(event.currentTarget.value) }
                  : current
              )}
          />
        </label>
      </div>
    {:else}
      <div class="group">
        <h3>Take</h3>
        {#if takes.length === 0}
          <p class="help">Add a take on the Takes step first.</p>
        {:else}
          <select
            class="field"
            value={act.takeId ?? ""}
            aria-label="Take this act plays"
            onchange={(event) => {
              const takeId = event.currentTarget.value || null;
              editPerformance((current) => ({
                ...current,
                takeId,
                sourceIn: 0,
                sourceOut: null,
              }));
            }}
          >
            {#each takes as entry (entry.id)}
              <option value={entry.id}>{entry.label}</option>
            {/each}
          </select>
        {/if}
      </div>

      {#if take}
        <div class="group">
          <h3>Part of the take</h3>
          <div class="row">
            <label class="time">
              <span>Starts at</span>
              <input
                class="field"
                bind:value={inDraft}
                inputmode="decimal"
                onchange={commitIn}
                onkeydown={(event) => event.key === "Enter" && commitIn()}
              />
            </label>
            <label class="time">
              <span>Ends at</span>
              <input
                class="field"
                bind:value={outDraft}
                inputmode="decimal"
                placeholder="the end"
                onchange={commitOut}
                onkeydown={(event) => event.key === "Enter" && commitOut()}
              />
            </label>
          </div>
          <div class="row">
            {#if takeSecondsAtPlayhead !== null}
              {@const at = takeSecondsAtPlayhead}
              <PanelButton onclick={() => setIn(at)}
                >Start at the playhead</PanelButton
              >
              <PanelButton onclick={() => setOut(at)}
                >End at the playhead</PanelButton
              >
            {/if}
            {#if performanceSpan}
              {@const span = performanceSpan}
              <PanelButton
                onclick={() =>
                  editPerformance((current) => ({
                    ...current,
                    sourceIn: span.sourceIn,
                    sourceOut: span.sourceOut,
                  }))}
              >
                Trim to the performance
              </PanelButton>
            {/if}
          </div>
        </div>

        <div class="group">
          <h3>Speed</h3>
          <SegmentedControl
            options={SPEEDS}
            value={String(act.speed)}
            onchange={(value) =>
              editPerformance((current) => ({
                ...current,
                speed: Number(value),
              }))}
            size="sm"
            ariaLabel="Speed"
          />
        </div>

        <div class="group">
          <h3>Layout</h3>
          <SegmentedControl
            options={[
              { value: "split", label: "Take over animation" },
              { value: "full", label: "Full frame" },
            ]}
            value={act.layout}
            onchange={(layout) =>
              editPerformance((current) => ({ ...current, layout }))}
            size="sm"
            ariaLabel="Layout"
          />
          {#if act.layout === "full"}
            <span class="label">Strip square</span>
            <SegmentedControl
              options={STRIPS}
              value={act.strip}
              onchange={(strip) =>
                editPerformance((current) => ({ ...current, strip }))}
              size="sm"
              ariaLabel="Strip square"
            />
            <p class="help">
              Both shows the arrows and the trails in turn, one pass each.
            </p>
            <label class="check">
              <input
                type="checkbox"
                checked={act.carousel}
                onchange={(event) =>
                  editPerformance((current) => ({
                    ...current,
                    carousel: event.currentTarget.checked,
                  }))}
              />
              Show the upcoming moves beside it
            </label>
          {/if}
        </div>

        <div class="group">
          <h3>Framing</h3>
          {#if act.layout === "full"}
            <SegmentedControl
              options={[
                { value: "frame", label: "Behind the strip" },
                { value: "above-strip", label: "Above the strip" },
              ]}
              value={act.framing.area}
              onchange={(area) => editFraming({ area })}
              size="sm"
              ariaLabel="Where the footage sits"
            />
          {/if}
          <SegmentedControl
            options={[
              { value: "cover", label: "Fill" },
              { value: "contain", label: "Whole picture" },
            ]}
            value={act.framing.fit}
            onchange={(fit) => editFraming({ fit })}
            size="sm"
            ariaLabel="Fit"
          />
          <label class="slider">
            <span>Zoom {act.framing.zoom.toFixed(2)}×</span>
            <input
              type="range"
              min={POST_PLAN_MIN_ZOOM}
              max={POST_PLAN_MAX_ZOOM}
              step="0.01"
              value={act.framing.zoom}
              oninput={(event) =>
                editFraming({ zoom: Number(event.currentTarget.value) })}
            />
          </label>
          <label class="slider">
            <span>Left and right</span>
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={act.framing.panX}
              oninput={(event) =>
                editFraming({ panX: Number(event.currentTarget.value) })}
            />
          </label>
          <label class="slider">
            <span>Up and down</span>
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={act.framing.panY}
              oninput={(event) =>
                editFraming({ panY: Number(event.currentTarget.value) })}
            />
          </label>
          <div class="row">
            <PanelButton
              onclick={() =>
                editFraming({ ...DEFAULT_FRAMING, area: act.framing.area })}
            >
              Reset framing
            </PanelButton>
          </div>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .acts,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .acts {
    gap: 1rem;
  }
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
  }
  .label,
  .slider span,
  .time span {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }
  .help {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .check input {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: var(--theme-primary, #d4813a);
  }
  .field {
    min-height: 2.75rem;
    padding: 0 0.5rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  .field:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 1px;
  }
  .time {
    display: grid;
    gap: 0.25rem;
  }
  .time .field {
    width: 7rem;
  }
  .slider {
    display: grid;
    gap: 0.25rem;
  }
  .slider input {
    width: 100%;
    min-height: 2rem;
    accent-color: var(--theme-primary, #d4813a);
  }
</style>
