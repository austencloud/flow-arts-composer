<script lang="ts">
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import type { EffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import EffectsPanel from "../EffectsPanel.svelte";

  // Test host: the viewer's tray (strip layout, fill) with its effects state
  // in context, as the app mounts it.
  let {
    state,
    twoProps = true,
    width = 380,
  }: {
    state: EffectsConfigState;
    twoProps?: boolean;
    width?: number;
  } = $props();
  // svelte-ignore state_referenced_locally
  setEffectsConfigContext(state);
</script>

<div style:width="{width}px" style:height="260px" style:display="flex">
  <EffectsPanel
    layout="strip"
    fill
    showHeading={false}
    bpm={60}
    onBpmChange={() => {}}
    isPlaying={false}
    onPlaybackToggle={() => {}}
    handProps={twoProps
      ? {
          hand: "both",
          leftPropType: PropType.STAFF,
          rightPropType: PropType.STAFF,
          onHandChange: () => {},
        }
      : undefined}
  />
</div>
