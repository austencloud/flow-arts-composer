<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import DisplayPanel from "$lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
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

<div class="display-rows">
  <div
    class="rt-section"
    role="region"
    aria-label={t("tab_settings_visibility")}
  >
    <DisplayPanel
      {sequence}
      {propType}
      fill={!dense}
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
</style>
