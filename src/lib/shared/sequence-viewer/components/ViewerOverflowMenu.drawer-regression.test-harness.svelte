<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import ViewerOverflowMenu from "./ViewerOverflowMenu.svelte";

  let viewerOpen = $state(true);
  let saved = $state(false);
</script>

<Drawer
  bind:isOpen={viewerOpen}
  placement="bottom"
  showHandle={false}
  ariaLabel={t("viewer_detail_sequence_viewer")}
  class="overflow-menu-regression-viewer"
>
  <ViewerOverflowMenu isSaved={saved} onSave={() => (saved = true)} />
</Drawer>

<output data-testid="viewer-open-state">{viewerOpen}</output>
<output data-testid="saved-state">{saved}</output>
