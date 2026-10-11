import type {
  MuseumExhibit,
  MuseumGroundsLayout,
  ExhibitSlot,
} from "#lib/shared/museum/domain/museum-types.js";

export function createMuseumState() {
  let layout = $state<MuseumGroundsLayout | null>(null);
  let exhibits = $state<Map<string, MuseumExhibit>>(new Map());
  let isOwner = $state(true);
  let selectedSlotId = $state<string | null>(null);
  let interactionTargetSlotId = $state<string | null>(null);
  let isOverlayOpen = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  const totalSlots = $derived(
    layout?.pavilions.reduce(
      (sum, p) => sum + p.slots.filter((s) => s.type === "wall").length,
      0
    ) ?? 0
  );

  const populatedCount = $derived(exhibits.size);

  return {
    get layout() { return layout; },
    get exhibits() { return exhibits; },
    get isOwner() { return isOwner; },
    get selectedSlotId() { return selectedSlotId; },
    get interactionTargetSlotId() { return interactionTargetSlotId; },
    get isOverlayOpen() { return isOverlayOpen; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get totalSlots() { return totalSlots; },
    get populatedCount() { return populatedCount; },

    setLayout(newLayout: MuseumGroundsLayout) { layout = newLayout; },
    setIsOwner(owner: boolean) { isOwner = owner; },
    setLoading(loading: boolean) { isLoading = loading; },
    setError(err: string | null) { error = err; },

    selectSlot(slotId: string | null) { selectedSlotId = slotId; },
    setInteractionTarget(slotId: string | null) { interactionTargetSlotId = slotId; },
    openOverlay() { isOverlayOpen = true; },
    closeOverlay() { isOverlayOpen = false; },

    assignExhibit(slotId: string, sequenceId: string) {
      const updated = new Map(exhibits);
      updated.set(slotId, {
        slotId,
        sequenceId,
        assignedAt: Date.now(),
      });
      exhibits = updated;
    },

    removeExhibit(slotId: string) {
      const updated = new Map(exhibits);
      updated.delete(slotId);
      exhibits = updated;
    },

    getExhibitForSlot(slotId: string): MuseumExhibit | undefined {
      return exhibits.get(slotId);
    },

    getSlotById(slotId: string): ExhibitSlot | undefined {
      if (!layout) return undefined;
      for (const pavilion of layout.pavilions) {
        const slot = pavilion.slots.find((s) => s.id === slotId);
        if (slot) return slot;
      }
      return undefined;
    },

    reset() {
      layout = null;
      exhibits = new Map();
      isOwner = true;
      selectedSlotId = null;
      interactionTargetSlotId = null;
      isOverlayOpen = false;
      isLoading = true;
      error = null;
    },
  };
}

export type MuseumState = ReturnType<typeof createMuseumState>;
