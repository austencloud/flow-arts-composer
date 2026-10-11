<script lang="ts">
  /**
   * One production Animal preset with its own effects-config context.
   *
   * The six formations share a scene-level renderer, but each orchestrator must
   * resolve a different Animal intent. Keeping the states local also prevents
   * this review page from touching Austen's saved Effects settings.
   */
  import TelekineticFormation3D from "#lib/features/museum/components/game/TelekineticFormation3D.svelte";
  import type { EffectPreset } from "#lib/shared/animation-engine/components/effects-panel/presets/types.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

  interface Props {
    preset: EffectPreset<"animal">;
    stationId: string;
    worldX: number;
    worldZ: number;
    showProps: boolean;
    playing: boolean;
    centerPlanes: number;
  }

  const props: Props = $props();
  const initialConfig = {
    ...DEFAULT_EFFECTS_CONFIG,
    animal: {
      ...DEFAULT_EFFECTS_CONFIG.animal,
      ...props.preset.patch,
    },
    activePresets: {
      ...DEFAULT_EFFECTS_CONFIG.activePresets,
      animal: props.preset.id,
    },
  };

  setEffectsConfigContext(
    createEffectsConfigState(initialConfig, { persist: false })
  );

  // One creature per preset. The wildcard explicitly silences every other tip,
  // while the blue prop's tracked right end receives Animal.
  const tipEffectMap: TipEffectMap = {
    "*": { effect: "none" },
    "0-1": { effect: "animal" },
  };
</script>

<TelekineticFormation3D
  stationId={props.stationId}
  worldX={props.worldX}
  worldZ={props.worldZ}
  sequenceId="gallery-practice-seq"
  presentation="sculpture"
  effectId="animal"
  {tipEffectMap}
  showProps={props.showProps}
  autoPlay={props.playing}
  centerPlanes={props.centerPlanes}
/>
