<script lang="ts">
  import { onDestroy } from "svelte";
  import { type UFOMood, type WobbleType } from "@austencloud/backgrounds";
  import CollapsibleLabSection from "#lib/shared/components/lab/CollapsibleLabSection.svelte";
  import LabStatusBar from "#lib/shared/components/lab/LabStatusBar.svelte";
  import { ChipToggle, ChipGroup } from '@austencloud/chip-toggle';
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";

  type ColorPreset = "default" | "cyan" | "blue" | "lime" | "amber" | "rose" | "emerald" | "red" | "gray";

  type EntranceType = "fade" | "warp" | "zoom" | "descend";
  type ExitType = "fade" | "warp" | "zoom" | "shootUp";

  interface UFOStatus {
    active: boolean;
    mood: string | null;
    tiredness: number | null;
    state: string | null;
    position: { x: number; y: number } | null;
    heading: number | null;
    scannedStars: number;
  }

  interface Props {
    status: UFOStatus;
    onSpawn: () => void;
    onSetMood: (mood: UFOMood) => void;
    onResetTiredness: () => void;
    onClearScannedStars: () => void;
    onTriggerWobble: (type: WobbleType) => void;
    onWander: () => void;
    onDrift: () => void;
    onPause: () => void;
    onScanStar: () => void;
    onScanGround: () => void;
    onEntranceType: (type: EntranceType) => void;
    onExitType: (type: ExitType) => void;
    onTriggerMeteor: () => void;
    onTriggerComet: () => void;
  }

  let {
    status,
    onSpawn,
    onSetMood,
    onResetTiredness,
    onClearScannedStars,
    onTriggerWobble,
    onWander,
    onDrift,
    onPause,
    onScanStar,
    onScanGround,
    onEntranceType,
    onExitType,
    onTriggerMeteor,
    onTriggerComet,
  }: Props = $props();

  // Track active trigger for visual feedback
  let activeMoodTrigger = $state<UFOMood | null>(null);
  let activeWobbleTrigger = $state<WobbleType | null>(null);

  // One-shot visual-feedback timers — cleared on destroy to avoid callbacks
  // firing against a torn-down component.
  const feedbackTimers = new Set<ReturnType<typeof setTimeout>>();

  // Status bar configuration
  let statusChips = $derived.by(() => {
    const chips: { label: string; color: "cyan" | "blue" | "green" | "orange" | "red" | "purple" | "gray" }[] = [];

    // State chip
    const stateColors: Record<string, "cyan" | "blue" | "green" | "orange" | "red" | "purple" | "gray"> = {
      wandering: "blue",
      paused: "orange",
      scanning_star: "green",
      scanning_ground: "green",
      tracking_event: "red",
      chasing: "red",
      entering: "purple",
      exiting: "purple",
      napping: "gray",
      celebrating: "orange",
    };
    chips.push({
      label: status.state ?? "inactive",
      color: stateColors[status.state ?? ""] ?? "gray"
    });

    // Mood chip
    const moodColors: Record<string, "cyan" | "blue" | "green" | "orange" | "red" | "purple" | "gray"> = {
      curious: "blue",
      excited: "orange",
      playful: "purple",
      bored: "gray",
      startled: "red",
      tired: "gray",
    };
    chips.push({
      label: status.mood ?? "none",
      color: moodColors[status.mood ?? ""] ?? "gray"
    });

    return chips;
  });

  let statusCounters = $derived([
    { icon: "fa-brain", value: `${status.scannedStars}/10`, label: "Stars scanned" },
  ]);


  const moodOptions: { mood: UFOMood; icon: string; color: ColorPreset }[] = [
    { mood: "curious", icon: "search", color: "blue" },
    { mood: "excited", icon: "bolt", color: "amber" },
    { mood: "playful", icon: "star", color: "default" },
    { mood: "bored", icon: "meh", color: "gray" },
    { mood: "startled", icon: "exclamation", color: "red" },
    { mood: "tired", icon: "bed", color: "gray" },
  ];

  const wobbleOptions: { type: WobbleType; label: string; icon: string; color: ColorPreset }[] = [
    { type: "curious_tilt", label: "Curious", icon: "search", color: "blue" },
    { type: "startled_jolt", label: "Startle", icon: "bolt", color: "amber" },
    { type: "disappointed_shake", label: "Disappoint", icon: "frown", color: "gray" },
    { type: "happy_bounce", label: "Happy", icon: "smile", color: "emerald" },
    { type: "yawn_stretch", label: "Yawn", icon: "bed", color: "gray" },
  ];

  const entranceOptions: { type: EntranceType; icon: string }[] = [
    { type: "fade", icon: "ghost" },
    { type: "warp", icon: "bolt" },
    { type: "zoom", icon: "compress-arrows-alt" },
    { type: "descend", icon: "arrow-down" },
  ];

  const exitOptions: { type: ExitType; icon: string }[] = [
    { type: "fade", icon: "ghost" },
    { type: "warp", icon: "bolt" },
    { type: "zoom", icon: "expand-arrows-alt" },
    { type: "shootUp", icon: "rocket" },
  ];

  function triggerMood(mood: UFOMood) {
    onSetMood(mood);
    activeMoodTrigger = mood;
    const timer = setTimeout(() => {
      if (activeMoodTrigger === mood) activeMoodTrigger = null;
    }, 300);
    feedbackTimers.add(timer);
  }

  function triggerWobble(type: WobbleType) {
    onTriggerWobble(type);
    activeWobbleTrigger = type;
    const timer = setTimeout(() => {
      if (activeWobbleTrigger === type) activeWobbleTrigger = null;
    }, 300);
    feedbackTimers.add(timer);
  }

  onDestroy(() => {
    for (const timer of feedbackTimers) clearTimeout(timer);
    feedbackTimers.clear();
  });
</script>

<div class="ufo-lab">
  <!-- Status Bar -->
  <LabStatusBar
    chips={statusChips}
    energy={{ value: 1 - (status.tiredness ?? 0), label: "Energy" }}
    counters={statusCounters}
  />

  <!-- Primary Action: Spawn -->
  <ActionButton label="Spawn UFO" icon="fa-satellite" fullWidth onclick={onSpawn} />

  <!-- Quick Commands -->
  <ChipGroup>
    <ChipToggle icon="random" label="Wander" layout="vertical" color="default" onclick={onWander} />
    <ChipToggle icon="cloud" label="Drift" layout="vertical" color="default" onclick={onDrift} />
    <ChipToggle icon="pause" label="Pause" layout="vertical" color="default" onclick={onPause} />
    <ChipToggle icon="crosshairs" label="Scan" layout="vertical" color="default" onclick={onScanStar} />
  </ChipGroup>

  <!-- Mood Control -->
  <CollapsibleLabSection title="Mood" icon="fa-heart" defaultOpen={true} accentColor="purple">
    <div class="trigger-grid cols-3">
      {#each moodOptions as { mood, icon, color }}
        <ChipToggle
          {icon}
          {color}
          active={activeMoodTrigger === mood || status.mood === mood}
          onclick={() => triggerMood(mood)}
        />
      {/each}
    </div>
    <div class="mood-actions">
      <ChipToggle icon="battery-full" label="Reset Energy" color="emerald" onclick={onResetTiredness} />
      <ChipToggle icon="eraser" label="Clear Memory" color="default" onclick={onClearScannedStars} />
    </div>
  </CollapsibleLabSection>

  <!-- Reactions (Wobbles) -->
  <CollapsibleLabSection title="Reactions" icon="fa-wave-square" defaultOpen={true} accentColor="purple">
    <div class="trigger-grid cols-3">
      {#each wobbleOptions as { type, label, icon, color }}
        <ChipToggle
          {icon}
          {label}
          {color}
          active={activeWobbleTrigger === type}
          onclick={() => triggerWobble(type)}
        />
      {/each}
    </div>
  </CollapsibleLabSection>

  <!-- Animations (Entrance/Exit) -->
  <CollapsibleLabSection title="Animations" icon="fa-door-open" defaultOpen={true} accentColor="purple">
    <div class="anim-group">
      <span class="anim-label">Enter</span>
      <div class="anim-row">
        {#each entranceOptions as { type, icon }}
          <ChipToggle {icon} color="cyan" onclick={() => onEntranceType(type)} />
        {/each}
      </div>
    </div>
    <div class="anim-group">
      <span class="anim-label">Exit</span>
      <div class="anim-row">
        {#each exitOptions as { type, icon }}
          <ChipToggle {icon} color="amber" onclick={() => onExitType(type)} />
        {/each}
      </div>
    </div>
  </CollapsibleLabSection>

  <!-- Events -->
  <CollapsibleLabSection title="Events" icon="fa-magic" defaultOpen={true} accentColor="purple">
    <div class="trigger-grid cols-2">
      <ChipToggle icon="meteor" label="Meteor" color="amber" onclick={onTriggerMeteor} />
      <ChipToggle icon="fire" label="Comet" color="cyan" onclick={onTriggerComet} />
    </div>
  </CollapsibleLabSection>

  <!-- Click Hint -->
  <div class="click-hint">
    <i class="fas fa-mouse-pointer"></i>
    <span>Click canvas to interact with UFO</span>
  </div>
</div>

<style>
  .ufo-lab {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Trigger Grids */
  .trigger-grid {
    display: grid;
    gap: 8px;
  }

  .trigger-grid.cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  .trigger-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  /* Mood Actions Row */
  .mood-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  }

  /* Animation Groups */
  .anim-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .anim-group:last-child {
    margin-bottom: 0;
  }

  .anim-label {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.5);
    width: 36px;
    flex-shrink: 0;
  }

  .anim-row {
    display: flex;
    gap: 6px;
    flex: 1;
  }

  /* Click Hint */
  .click-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.35);
  }

  .click-hint i {
    font-size: 0.65rem;
  }
</style>
