<script lang="ts">
  import ContactControls from "./ContactControls.svelte";
  import ContactTeachingOverlay from "./ContactTeachingOverlay.svelte";
  import ContactViewerCanvas from "./ContactViewerCanvas.svelte";
  import { setContactLabContext } from "../context/contact-lab-context";
  import type { ContactPalmspinProfile } from "../domain/contact-motion-profile";
  import { createContactLabState } from "../state/contact-lab-state.svelte";

  interface Props {
    profile: ContactPalmspinProfile;
  }

  let { profile }: Props = $props();
  const labState = createContactLabState(profile);
  setContactLabContext(labState);

  let width = $state(1280);
  let height = $state(800);
  const aspect = $derived(width / Math.max(height, 1));
</script>

<main class="contact-lab" bind:clientWidth={width} bind:clientHeight={height}>
  <ContactViewerCanvas {aspect} />
  <ContactTeachingOverlay />
  <ContactControls />
</main>

<style>
  .contact-lab {
    /* behind the status bar: a full-screen lab scene, its controls sit lower down */
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    container-type: size;
    color: var(--theme-text, #f8f9ff);
    background: #070b14;
  }
</style>
