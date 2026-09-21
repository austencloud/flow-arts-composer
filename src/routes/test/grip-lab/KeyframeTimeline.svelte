<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import { popIn } from "$lib/shared/transitions/motion";
  import { sampleTeachingPose, type TeachingKey } from "./isolation-teaching";

  interface Props {
    keys: readonly TeachingKey[];
    phase: number;
    range: readonly [number, number];
    selectedKey: TeachingKey | undefined;
    canUndo: boolean;
    onSelect: (phase: number) => void;
    onAdd: () => void;
    onRemove: () => void;
    onUndo: () => void;
    onMove: (from: number, to: number) => boolean;
    onEdit: () => void;
    onBegin: () => void;
    onEnd: () => void;
  }
  let {
    keys,
    phase,
    range,
    selectedKey,
    canUndo,
    onSelect,
    onAdd,
    onRemove,
    onUndo,
    onMove,
    onEdit,
    onBegin,
    onEnd,
  }: Props = $props();
  let width = $state(800);
  let moveError = $state("");
  let moving = false;
  let timingRoot: HTMLDivElement | undefined;
  let moveStarted = false;
  const names = ["S", "SE", "E", "NE", "N", "NW", "W", "SW", "S"];
  const selectedIndex = $derived(
    selectedKey ? keys.findIndex((key) => key.phase === selectedKey.phase) : -1
  );
  const shown = $derived.by(() => {
    const visible = keys.filter(
      (key) => key.phase >= range[0] && key.phase <= range[1]
    );
    const south = keys.find((key) => key.phase === 0);
    return range[0] === 3 && south
      ? [...visible, { ...south, phase: 4 }]
      : visible;
  });
  const percent = (t: number) => ((t - range[0]) / (range[1] - range[0])) * 100;
  const label = (t: number) => {
    const stop = Math.round(t * 2);
    return Math.abs(t * 2 - stop) < 0.001
      ? `${names[stop]} · ${t.toFixed(3)}`
      : t.toFixed(3);
  };
  // Keep nearby keys individually clickable, including the user's .500/.538 pair.
  const markers = $derived.by(() => {
    const laneEnds: number[] = [];
    return shown.map((key) => {
      const x = (percent(key.phase) / 100) * Math.max(1, width - 48);
      let lane = laneEnds.findIndex((end) => x - end >= 48);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = x;
      return { key, lane, percent: percent(key.phase) };
    });
  });
  const lanes = $derived(
    Math.max(2, ...markers.map((marker) => marker.lane + 1))
  );
  const leanCurve = $derived.by(() =>
    Array.from({ length: 161 }, (_, index) => {
      const t = range[0] + ((range[1] - range[0]) * index) / 160;
      const lean = (sampleTeachingPose(t, keys).lean * 180) / Math.PI;
      return `${index === 0 ? "M" : "L"}${(index * 1000) / 160},${25 - lean}`;
    }).join(" ")
  );
  const lean = $derived((sampleTeachingPose(phase, keys).lean * 180) / Math.PI);

  function select(t: number) {
    moveError = "";
    onSelect(t);
  }
  function neighbor(direction: -1 | 1) {
    const t = phase % 4;
    const target =
      direction > 0
        ? (keys.find((key) => key.phase > t + 0.005) ?? keys[0])
        : ([...keys].reverse().find((key) => key.phase < t - 0.005) ??
          keys.at(-1));
    if (target) select(target.phase);
  }
  function move(value: number) {
    if (!selectedKey) return;
    if (Number(selectedKey.phase.toFixed(3)) === Number(value.toFixed(3)))
      return;
    if (moving && !moveStarted) {
      moveStarted = true;
      onBegin();
    }
    moveError = onMove(selectedKey.phase, value)
      ? ""
      : "Another keyframe is already there.";
  }
  function beginMove() {
    moving = true;
  }
  function endMove() {
    if (moving) {
      moving = false;
      if (moveStarted) onEnd();
      moveStarted = false;
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (event.target instanceof Node && timingRoot?.contains(event.target))
      beginMove();
  }}
  onkeydowncapture={(event) => {
    if (
      event.target instanceof HTMLButtonElement &&
      timingRoot?.contains(event.target) &&
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(event.key)
    )
      beginMove();
  }}
  onkeyup={endMove}
  onpointerup={endMove}
  onpointercancel={endMove}
  onblur={endMove}
/>

<section class="keyframe-timeline" aria-label="Pose keyframes">
  <div class="heading">
    <strong
      >Keyframes <span
        >{shown.length === keys.length
          ? keys.length
          : `${shown.length} of ${keys.length}`}</span
      ></strong
    >
    <span class="curve-label"
      >Stage-right lean <output aria-label="Current stage-right lean"
        >{lean.toFixed(1)}°</output
      ></span
    >
    <span class="blend">Smooth blend · whole pose</span>
  </div>
  <div class="ruler" bind:clientWidth={width}>
    <div class="track" style:height={`${32 + lanes * 44}px`}>
      <svg
        class="curve"
        viewBox="0 0 1000 50"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0,25 H1000" class="zero" />
        <path d={leanCurve} class="lean" />
      </svg>
      {#each names as name, index}
        {@const t = index / 2}
        {#if t >= range[0] && t <= range[1]}
          <span class="tick" style:left={`${percent(t)}%`}
            ><span>{name}</span></span
          >
        {/if}
      {/each}
      <span
        class="playhead"
        style:left={`${Math.max(0, Math.min(100, percent(phase)))}%`}
        aria-hidden="true"
      ></span>
      {#each markers as marker (marker.key.phase)}
        <button
          type="button"
          class="marker"
          class:selected={selectedKey?.phase === marker.key.phase % 4}
          style:left={`${marker.percent}%`}
          style:top={`${32 + marker.lane * 44}px`}
          aria-label={`Keyframe ${label(marker.key.phase)}, stage-right lean ${((marker.key.lean * 180) / Math.PI).toFixed(1)} degrees`}
          aria-pressed={selectedKey?.phase === marker.key.phase % 4}
          title={`Select keyframe ${label(marker.key.phase)}`}
          onclick={() => select(marker.key.phase)}
          in:popIn
        >
          <span class="diamond" aria-hidden="true"></span><span
            >{marker.key.phase.toFixed(3)}</span
          >
        </button>
      {/each}
    </div>
  </div>
  <div class="toolbar">
    <div class="navigation">
      <PanelButton ariaLabel="Previous keyframe" onclick={() => neighbor(-1)}
        >‹</PanelButton
      >
      <span class="selection"
        >{selectedKey
          ? `Keyframe ${selectedIndex + 1} · ${label(selectedKey.phase)}`
          : `Between keys · ${phase.toFixed(3)}`}</span
      >
      <PanelButton ariaLabel="Next keyframe" onclick={() => neighbor(1)}
        >›</PanelButton
      >
    </div>
    <div class="actions">
      <PanelButton
        disabled={!!selectedKey || keys.length >= 100}
        onclick={() => {
          moveError = "";
          onAdd();
        }}>Add keyframe</PanelButton
      >
      <PanelButton
        disabled={!selectedKey || keys.length <= 1}
        onclick={() => {
          moveError = "";
          onRemove();
        }}>Delete keyframe</PanelButton
      >
      <PanelButton
        disabled={!canUndo}
        onclick={() => {
          moveError = "";
          onUndo();
        }}>Undo</PanelButton
      >
    </div>
    <div
      class="timing"
      role="group"
      aria-label="Keyframe timing"
      bind:this={timingRoot}
    >
      {#if selectedKey}
        <ScrubbableNumber
          value={selectedKey.phase}
          min={0}
          max={3.999}
          step={0.001}
          label="Keyframe position"
          onchange={move}
        />
      {:else}<span class="muted">Editing here adds a keyframe.</span>{/if}
    </div>
    <PanelButton disabled={!selectedKey} onclick={onEdit}
      >Edit whole pose</PanelButton
    >
  </div>
  <p class="feedback" role="status">
    {moveError ||
      (keys.length === 1
        ? "One keyframe holds the pose through the loop."
        : "Deleting removes the whole pose; the remaining keyframes blend together.")}
  </p>
</section>

<style>
  .keyframe-timeline {
    min-width: 0;
    font-size: var(--font-size-min, 14px);
    container-type: inline-size;
  }
  .heading,
  .curve-label,
  .toolbar,
  .navigation,
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .heading,
  .curve-label,
  .toolbar {
    justify-content: space-between;
  }
  .heading {
    padding: 0.25rem 0;
  }
  .heading strong span {
    color: var(--theme-text-dim);
    font-weight: 400;
    margin-left: 0.35rem;
  }
  .heading strong,
  .curve-label {
    white-space: nowrap;
  }
  .blend,
  .curve-label,
  .feedback,
  .muted {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }
  .curve-label {
    padding: 0.25rem 0;
  }
  output,
  .selection,
  .marker {
    font-variant-numeric: tabular-nums;
  }
  .ruler {
    box-sizing: border-box;
    padding: 0 24px;
    background: var(--theme-card-bg);
    border-radius: 0.4rem;
  }
  .track {
    position: relative;
    min-height: 120px;
  }
  .curve {
    position: absolute;
    width: 100%;
    height: 32px;
    overflow: visible;
  }
  .curve path {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .zero {
    stroke: var(--theme-stroke);
    stroke-width: 1;
  }
  .lean {
    stroke: var(--theme-accent);
    stroke-width: 2;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--theme-stroke);
    pointer-events: none;
  }
  .tick span {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 12px;
    color: var(--theme-text-dim);
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--theme-text);
    pointer-events: none;
  }
  .marker {
    position: absolute;
    translate: -50% 0;
    width: 44px;
    height: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 2px;
    font: inherit;
    font-size: 12px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    cursor: pointer;
  }
  .marker:hover,
  .marker.selected {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 18%,
      var(--theme-panel-bg)
    );
  }
  .marker:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .diamond {
    width: 9px;
    height: 9px;
    transform: rotate(45deg);
    border: 1px solid currentColor;
  }
  .selected .diamond {
    background: var(--theme-accent);
  }
  .toolbar {
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.4rem;
  }
  .selection {
    min-width: 10rem;
    text-align: center;
  }
  .navigation,
  .actions {
    flex-wrap: wrap;
  }
  .navigation {
    display: grid;
    grid-template-columns: 44px minmax(10rem, 1fr) 44px;
  }
  .timing {
    min-width: 12rem;
    order: 1;
  }
  .actions {
    order: 3;
    margin-left: auto;
  }
  .toolbar :global(> button) {
    order: 2;
  }
  .feedback {
    margin: 0.25rem 0 0;
    min-height: 1.3em;
    line-height: 1.3;
  }
  @container (max-width: 560px) {
    .blend {
      display: none;
    }
    .toolbar {
      align-items: stretch;
    }
    .navigation {
      width: 100%;
      justify-content: space-between;
      grid-template-columns: 44px minmax(0, 1fr) 44px;
    }
    .selection {
      min-width: 0;
    }
    .actions {
      width: 100%;
    }
    .actions :global(> *) {
      flex: 1;
    }
    .timing {
      min-width: 0;
    }
  }
</style>
