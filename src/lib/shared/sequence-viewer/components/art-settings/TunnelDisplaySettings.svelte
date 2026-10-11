<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import DisplayPanel from "#lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { reportArtSetting } from "./art-setting-change";
  import type { ArtSettingChangeHandler } from "./art-settings-types";

  interface Props {
    sequence?: SequenceData;
    propType: PropType;
    dense: boolean;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let { sequence, propType, dense, onArtSettingChange }: Props = $props();
</script>

<div class="display-rows" class:dense>
  <div
    class="rt-section"
    role="region"
    aria-label={t("tab_settings_visibility")}
  >
    <DisplayPanel
      {sequence}
      {propType}
      fill={!dense}
      grow={!dense}
      onSettingChange={(group, setting, previousValue, value, options) =>
        reportArtSetting(
          onArtSettingChange,
          group,
          setting,
          previousValue,
          value,
          options?.coalesce
        )}
    />
  </div>
</div>

<style>
  .display-rows,
  .rt-section {
    display: flex;
    flex: 1 1 0;
    min-height: 0;
    flex-direction: column;
  }

  /* The sidebar hands these rows a height to divide, so they fill it. The dock
     tray is the other way round: it takes its height FROM the content, and a
     `flex: 1 1 0` child reports zero. The tray then opened at zero height, the
     mode bar ducked away, and no Display tiles showed. Same rule as the 2D
     Animation panel's dock. */
  .display-rows.dense,
  .display-rows.dense .rt-section {
    flex: 0 0 auto;
  }
</style>
