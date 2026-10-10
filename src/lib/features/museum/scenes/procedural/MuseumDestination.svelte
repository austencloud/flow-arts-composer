<script lang="ts">

import * as museumPersister from "#lib/features/museum/scenes/procedural/services/museum-persister.js";
  import WorldScene from "#lib/shared/3d/procedural-engine/components/WorldScene.svelte";
  import { MUSEUM_GROUNDS_CONFIG } from "#lib/shared/3d/procedural-engine/core/world-definitions.js";
  import { getActiveMuseumState } from "#lib/shared/museum/state/museum-state-bridge.svelte.js";
  import InteractionPrompt from "./components/InteractionPrompt.svelte";
  import SequenceBrowserOverlay from "./overlay/SequenceBrowserOverlay.svelte";
  import { destinationManager } from "#lib/shared/3d/destinations/destination-manager.svelte.js";
  // The userId to view - if set and different from current user, this is visitor mode
  const CURRENT_USER_ID = "local-user"; // Placeholder until auth integration
  const visitingUserId = $derived(destinationManager.navigationParams.userId || CURRENT_USER_ID);
  const isOwnerMode = $derived(visitingUserId === CURRENT_USER_ID);

  // Reactive access to the shared museum state (published by WorldSceneContent)
  const museumState = $derived(getActiveMuseumState());

  // Set ownership on museum state when it becomes available
  $effect(() => {
    if (museumState) {
      museumState.setIsOwner(isOwnerMode);
    }
  });

  // Load exhibits from Firebase when museum state is ready
  $effect(() => {
    if (museumState && museumState.layout) {
      loadExhibits();
    }
  });

  async function loadExhibits() {
    if (!museumState) return;

    try {
      const data = await museumPersister.loadMuseum(visitingUserId);
      if (data) {
        for (const [slotId, exhibit] of data.exhibits) {
          museumState.assignExhibit(slotId, exhibit.sequenceId);
        }
      }
      museumState.setLoading(false);
    } catch {
      museumState.setLoading(false);
    }
  }

  // Interaction target info derived from museum state
  const interactionTarget = $derived.by(() => {
    if (!museumState?.interactionTargetSlotId) return null;
    return museumState.getSlotById(museumState.interactionTargetSlotId);
  });

  const isTargetPopulated = $derived.by(() => {
    if (!museumState || !interactionTarget) return false;
    return !!museumState.getExhibitForSlot(interactionTarget.id);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!museumState) return;

    // E key to interact with targeted slot
    if (e.key === "e" || e.key === "E") {
      if (museumState.isOverlayOpen) return;
      if (!interactionTarget) return;

      museumState.selectSlot(interactionTarget.id);

      if (museumState.isOwner && !isTargetPopulated) {
        // Open sequence browser to assign a sequence
        museumState.openOverlay();
        document.exitPointerLock();
      }
    }
  }

  async function handleSequenceSelect(sequenceId: string) {
    if (!museumState?.selectedSlotId) return;

    const slotId = museumState.selectedSlotId;
    museumState.assignExhibit(slotId, sequenceId);
    museumState.closeOverlay();
    museumState.selectSlot(null);

    // Persist to Firebase
    try {
      await museumPersister.saveExhibit(CURRENT_USER_ID, slotId, sequenceId);
    } catch {
      // Exhibit is already assigned locally; Firebase failure is non-blocking
    }

    // Re-acquire pointer lock
    document.body.requestPointerLock();
  }

  function handleOverlayClose() {
    if (!museumState) return;
    museumState.closeOverlay();
    museumState.selectSlot(null);
    document.body.requestPointerLock();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<WorldScene realmConfig={MUSEUM_GROUNDS_CONFIG} />

{#if museumState}
  <InteractionPrompt
    visible={!!interactionTarget && !museumState.isOverlayOpen}
    isPopulated={isTargetPopulated}
    isOwner={museumState.isOwner}
  />

  <SequenceBrowserOverlay
    visible={museumState.isOverlayOpen}
    onSelect={handleSequenceSelect}
    onClose={handleOverlayClose}
  />
{/if}
