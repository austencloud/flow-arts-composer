<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  import type { PoseHandle, TeachingPose } from "./isolation-teaching";

  interface Props {
    pose: TeachingPose;
    selected: PoseHandle;
    onSelect: (handle: PoseHandle) => void;
    onBegin: () => void;
    onChange: (changes: Partial<TeachingPose>) => void;
    onEnd: () => void;
    tolerance: number;
    onTolerance: (value: number) => void;
    tipDrift: number;
  }

  let {
    pose,
    selected,
    onSelect,
    onBegin,
    onChange,
    onEnd,
    tolerance,
    onTolerance,
    tipDrift,
  }: Props = $props();

  const handles = [
    { value: "chest", label: "Chest" },
    { value: "pelvis", label: "Pelvis" },
    { value: "elbow", label: "Elbow" },
    { value: "tip", label: "Tip" },
    { value: "grip", label: "Grip" },
    { value: "fingers", label: "Fingers" },
  ] as const;
  const degrees = 180 / Math.PI;
  const radians = Math.PI / 180;
  const fingers = ["thumb", "index", "middle", "ring", "pinky"] as const;
  type Finger = (typeof fingers)[number];
  let selectedFinger = $state<Finger>("index");
  let editing = false;

  function update(changes: Partial<TeachingPose>): void {
    onChange(changes);
  }

  function beginEdit(): void {
    if (editing) return;
    editing = true;
    onBegin();
  }

  function endEdit(): void {
    if (!editing) return;
    editing = false;
    onEnd();
  }

  function usePhotoHand(): void {
    onBegin();
    onChange({
      gripRelaxation: 1,
      wristBend: 0,
      wristTwist: 0,
      wristRaise: 0,
      thumbSpread: 25 * radians,
      thumbCurl: 0,
      indexCurl: 0,
      middleCurl: 0,
      ringCurl: 0,
      pinkyCurl: 0,
      ...Object.fromEntries(fingers.flatMap((finger) => [1, 2, 3].map((joint) => [`${finger}Joint${joint}`, 0]))),
    });
    onEnd();
  }

  function slider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (next: number) => void,
    unit: string
  ) {
    return { label, value, min, max, step, change, unit };
  }

  const controls = $derived.by(() => {
    if (selected === "grip") {
      return [
        slider("Relaxed grip", pose.gripRelaxation * 100, 0, 100, 1, (v) => update({ gripRelaxation: v / 100 }), "%"),
        slider("Shaft angle in hand", pose.gripTilt * degrees, 0, 80, 1, (v) => update({ gripTilt: v * radians }), "°"),
        slider("Wrist bend", pose.wristBend * degrees, -30, 30, 1, (v) => update({ wristBend: v * radians }), "°"),
        slider("Wrist twist", pose.wristTwist * degrees, -30, 30, 1, (v) => update({ wristTwist: v * radians }), "°"),
        slider("Wrist up along staff", pose.wristRaise * 100, -8, 8, 0.5, (v) => update({ wristRaise: v / 100 }), "cm"),
      ];
    }
    if (selected === "fingers") {
      return [
        ...(selectedFinger === "thumb" ? [slider("Thumb across shaft", pose.thumbSpread * degrees, -45, 45, 1, (v) => update({ thumbSpread: v * radians }), "°")] : []),
        slider("Whole finger curl", pose[`${selectedFinger}Curl`] * degrees, -45, 45, 1,
          (v) => update({ [`${selectedFinger}Curl`]: v * radians }), "°"),
        ...([1, 2, 3] as const).map((joint) =>
          slider(["", "Base", "Middle", "Tip"][joint]!, pose[`${selectedFinger}Joint${joint}`] * degrees, -60, 60, 1,
            (v) => update({ [`${selectedFinger}Joint${joint}`]: v * radians }), "°")
        ),
      ];
    }
    if (selected === "chest") {
      return [
        slider("Turn toward stage left", pose.turn * degrees, -90, 90, 1, (v) => update({ turn: v * radians }), "°"),
        slider("Lean toward stage right", pose.lean * degrees, -20, 20, 1, (v) => update({ lean: v * radians }), "°"),
        slider("Lean downstage", pose.pitch * degrees, -20, 20, 1, (v) => update({ pitch: v * radians }), "°"),
      ];
    }
    if (selected === "pelvis") {
      return [
        slider("Pelvis stage right", -pose.pelvisX * 100, -15, 15, 0.5, (v) => update({ pelvisX: -v / 100 }), "cm"),
        slider("Pelvis up", pose.pelvisY * 100, -15, 15, 0.5, (v) => update({ pelvisY: v / 100 }), "cm"),
        slider("Pelvis downstage", pose.pelvisZ * 100, -15, 15, 0.5, (v) => update({ pelvisZ: v / 100 }), "cm"),
      ];
    }
    if (selected === "elbow") {
      return [
        slider("Elbow stage right", -pose.elbowX * 25, -37.5, 37.5, 1, (v) => update({ elbowX: -v / 25 }), "cm"),
        slider("Elbow up", pose.elbowY * 25, -37.5, 37.5, 1, (v) => update({ elbowY: v / 25 }), "cm"),
        slider("Elbow downstage", pose.elbowZ * 25, -37.5, 37.5, 1, (v) => update({ elbowZ: v / 25 }), "cm"),
      ];
    }
    return [
      slider("Tip stage right", -pose.tipX * 100, -20, 20, 0.5, (v) => update({ tipX: -v / 100 }), "cm"),
      slider("Tip up", pose.tipY * 100, -20, 20, 0.5, (v) => update({ tipY: v / 100 }), "cm"),
      slider("Tip upstage", -pose.tipZ * 100, -20, 20, 0.5, (v) => update({ tipZ: -v / 100 }), "cm"),
    ];
  });
</script>

<section class="pose-editor" aria-label="Direct pose editor">
  <SegmentedControl
    options={handles}
    value={selected}
    columns={3}
    onchange={(value) => onSelect(value as PoseHandle)}
    ariaLabel="Pose handle"
  />

  {#if selected === "fingers"}
    <button class="photo-pose" type="button" onclick={usePhotoHand}>Use photo hand</button>
    <SegmentedControl
      options={fingers.map((finger) => ({ value: finger, label: finger[0]!.toUpperCase() + finger.slice(1) }))}
      value={selectedFinger}
      columns={3}
      onchange={(value) => selectedFinger = value as Finger}
      ariaLabel="Finger to adjust"
    />
  {/if}

  <div class="sliders">
    {#each controls as control (control.label)}
      <label>
        <span>{control.label}</span>
        <output>{control.value.toFixed(control.unit === "°" ? 0 : 1)}{control.unit}</output>
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={control.value}
          aria-label={control.label}
          onpointerdown={beginEdit}
          onpointerup={endEdit}
          onpointercancel={endEdit}
          onkeydown={beginEdit}
          onkeyup={endEdit}
          onblur={endEdit}
          onchange={endEdit}
          oninput={(event) => control.change(Number(event.currentTarget.value))}
        />
      </label>
    {/each}
  </div>

  <label class="tolerance">
    <span>Allowed tip drift</span>
    <output>{(tolerance * 100).toFixed(0)} cm allowed · {(tipDrift * 100).toFixed(1)} cm actual</output>
    <input
      type="range"
      min="0"
      max="0.2"
      step="0.005"
      value={tolerance}
      aria-label="Allowed tip drift"
      oninput={(event) => onTolerance(Number(event.currentTarget.value))}
    />
  </label>
  <p>Edits save a whole-pose keyframe here.</p>
  {#if selected === "elbow"}<p>The handle guides the elbow’s direction; arm length still limits its position.</p>{/if}
  {#if selected === "grip"}<p>Wrist height slides the grip along the shaft; the elbow follows.</p>{/if}
  {#if selected === "fingers"}<p>Select a finger, then bend its base, middle, or tip. These edits blend between keyframes.</p>{/if}
</section>

<style>
  .pose-editor {
    display: grid;
    gap: 0.75rem;
    padding: 0;
    color: var(--theme-text);
    container-type: inline-size;
  }
  .sliders { display: grid; gap: 0.6rem; }
  label { display: grid; grid-template-columns: minmax(8rem, 1fr) auto; gap: 0.25rem 0.6rem; align-items: center; min-height: 44px; font-size: var(--font-size-min, 14px); }
  output { color: var(--theme-text-dim); font-variant-numeric: tabular-nums; font-size: var(--font-size-compact, 12px); }
  input { grid-column: 1 / -1; width: 100%; accent-color: var(--theme-accent); }
  .tolerance { padding-top: 0.5rem; border-top: 1px solid var(--theme-stroke); }
  .photo-pose { min-height: 44px; border: 1px solid var(--theme-stroke); border-radius: var(--radius-md, 8px); background: var(--theme-surface); color: var(--theme-text); font: inherit; cursor: pointer; }
  .photo-pose:hover { border-color: var(--theme-accent); }
  .photo-pose:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
  p { margin: 0; color: var(--theme-text-dim); font-size: var(--font-size-min, 14px); }
  @container (max-width: 22rem) { label { grid-template-columns: 1fr; gap: 0.15rem; } }
</style>
