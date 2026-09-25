<!-- VersionDetailPanel - Drawer wrapper for version detail content -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { onMount } from "svelte";
  import type { AppVersion } from "$lib/shared/versioning/domain/models/version-models";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import VersionDetailContent from "./VersionDetailContent.svelte";

  let {
    version,
    isOpen = $bindable(false),
    onVersionUpdated,
  }: {
    version: AppVersion | null;
    isOpen?: boolean;
    onVersionUpdated?: () => void;
  } = $props();

  let isMobile = $state(false);

  const placement = $derived(isMobile ? "bottom" : "right");

  onMount(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    isMobile = mq.matches;
    const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  });
</script>

<Drawer
  bind:isOpen
  {placement}
  showHandle={isMobile}
  ariaLabel={version
    ? t("settings_version_details_named", { version: version.version })
    : t("settings_version_details")}
>
  {#if version}
    <VersionDetailContent
      {version}
      {onVersionUpdated}
      showCloseButton={true}
      onClose={() => (isOpen = false)}
    />
  {/if}
</Drawer>
