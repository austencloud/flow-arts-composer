<script lang="ts">
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    label: string;
    description?: string;
    enabled?: boolean;
    isBusy?: boolean;
    disabled?: boolean;
    surface?: "plain" | "card" | "inset";
    onToggle: () => void;
  }

  let {
    label,
    description,
    enabled = false,
    isBusy = false,
    disabled = false,
    surface = "plain",
    onToggle,
  }: Props = $props();
</script>

<SettingToggleButton
  {label}
  {description}
  checked={enabled}
  busy={isBusy}
  {disabled}
  {onToggle}
  {surface}
  onLabel={t("feedback_state_on")}
  offLabel={t("feedback_state_off")}
/>
