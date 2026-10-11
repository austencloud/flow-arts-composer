import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  TUNNEL_COMPOSITION_VERSION,
  MAX_AUTHORED_TUNNEL_PERFORMERS,
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  migrateTunnelComposition,
  type TunnelComposition,
  type TunnelPerformer,
  type TunnelSourceProvenance,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import {
  cloneTunnelStage,
  createExplicitTunnelStage,
  fitTunnelStageToFormation,
  type TunnelStage,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-stage.js";
import {
  DEFAULT_CONFIG,
  FOLD_OPTIONS,
  configKey,
  imageCount,
  type TunnelConfig,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { deriveTunnelName } from "#lib/shared/sequence-viewer/tunnel/tunnel-name.js";
import {
  TUNNEL_CREATOR_DRAFT_VERSION,
  type TunnelCreatorDraft,
  type TunnelEditTarget,
  type TunnelSourceHistoryEntry,
  type TunnelSourceOrigin,
  type TunnelWorkflowMode,
  type TunnelWorkspacePanel,
} from "../domain/tunnel-creator-draft";
import {
  DEFAULT_TUNNEL_RELATIONSHIP,
  tunnelRelationshipFromOps,
  tunnelRelationshipOps,
  updateTunnelRelationship,
  type TunnelRelationshipRule,
} from "../domain/tunnel-relationship-rule";
import type { TunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import type { TunnelPresentationState } from "./tunnel-presentation-state.svelte";

const INITIAL_VISIBLE_PERFORMERS = 2;
const MAX_SOURCE_HISTORY = 12;
/** The normal authoring surface stays legible at four cards. The persisted
 * schema deliberately remains eight so older, larger casts reopen losslessly. */
export const MAX_INTERACTIVE_TUNNEL_PERFORMERS = 4;

export type TunnelCreatorMode = "separate" | "linked";
export type TunnelPickerTarget = string;

export interface TunnelPerformerSlot {
  id: string;
  label: string;
  performer: TunnelPerformer | null;
  independentSequence: SequenceData | null;
  origin: TunnelSourceOrigin | null;
  sourceSequenceId: string | null;
  provenance: TunnelSourceProvenance | null;
  previous: TunnelSourceHistoryEntry[];
  timing: TunnelPerformer["timing"];
  relationship: TunnelRelationshipRule;
}

export interface TunnelCreatorDependencies {
  openComposition: (
    composition: TunnelComposition,
    presentation: TunnelSnapshot
  ) => void;
  presentation: TunnelPresentationState;
  initialComposition?: TunnelComposition;
  initialDraft?: TunnelCreatorDraft | null;
  initialFormation?: TunnelConfig;
  editingTunnel?: TunnelEditTarget;
  now?: () => number;
  createId?: () => string;
}

/** Owns the ordered authored cast and its performer-scoped source workspaces. */
export function createTunnelCreatorState(
  dependencies: TunnelCreatorDependencies
) {
  const now = dependencies.now ?? Date.now;
  const createId =
    dependencies.createId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const restoredDraft = dependencies.initialComposition
    ? null
    : (dependencies.initialDraft ?? null);
  const initialSource =
    dependencies.initialComposition ?? restoredDraft?.composition ?? undefined;
  const initial = initialSource
    ? migrateTunnelComposition(initialSource)
    : undefined;
  const compositionId = initial?.id ?? createId();
  const createdAt = initial?.createdAt ?? now();
  const restoredSources = new Map(
    (restoredDraft?.sourceStates ?? []).map((source) => [
      source.performerId,
      source,
    ])
  );

  function createSlot(
    index: number,
    performer: TunnelPerformer | null = null
  ): TunnelPerformerSlot {
    const id =
      performer?.id ??
      restoredDraft?.sourceStates[index]?.performerId ??
      `performer-${createId()}`;
    const sourceState = restoredSources.get(id);
    const independentSequence =
      sourceState?.independentSequence ??
      (performer?.source.kind === "independent"
        ? performer.source.sequence
        : null);
    const independentSource =
      performer?.source.kind === "independent" ? performer.source : null;
    const label = `Performer ${index + 1}`;

    return {
      id,
      label,
      performer: performer ? { ...performer, label } : null,
      independentSequence,
      origin:
        sourceState?.origin ??
        (performer?.source.kind === "independent" ? "picked" : null),
      sourceSequenceId:
        sourceState?.sourceSequenceId ??
        independentSource?.sourceSequenceId ??
        independentSequence?.id ??
        null,
      provenance:
        sourceState?.provenance ?? independentSource?.provenance ?? null,
      previous: sourceState?.previous.map((entry) => ({ ...entry })) ?? [],
      timing: { ...(performer?.timing ?? { stepOffset: 0, speed: 1 }) },
      relationship: {
        ...(performer?.source.kind === "derived"
          ? tunnelRelationshipFromOps(performer.source.transforms)
          : index === 1
            ? (restoredDraft?.relationship ?? DEFAULT_TUNNEL_RELATIONSHIP)
            : DEFAULT_TUNNEL_RELATIONSHIP),
      },
    };
  }

  const initialSlots = restoredDraft?.sourceStates.length
    ? restoredDraft.sourceStates
        .slice(0, MAX_AUTHORED_TUNNEL_PERFORMERS)
        .map((source, index) =>
          createSlot(
            index,
            initial?.performers.find(
              (performer) => performer.id === source.performerId
            ) ?? null
          )
        )
    : (initial?.performers ?? [])
        .slice(0, MAX_AUTHORED_TUNNEL_PERFORMERS)
        .map((performer, index) => createSlot(index, performer));
  while (initialSlots.length < INITIAL_VISIBLE_PERFORMERS) {
    initialSlots.push(createSlot(initialSlots.length));
  }

  let mode = $state<TunnelCreatorMode>(
    dependencies.initialComposition
      ? initialSlots[1]?.performer?.source.kind === "independent"
        ? "separate"
        : "linked"
      : (restoredDraft?.mode ??
          (initialSlots[1]?.performer?.source.kind === "independent"
            ? "separate"
            : "linked"))
  );
  let workflow = $state<TunnelWorkflowMode>(
    restoredDraft?.workflow ?? inferWorkflow(initial?.performers ?? [])
  );
  let slots = $state<TunnelPerformerSlot[]>(initialSlots);
  // A one-performer composition came from the legacy save shape. The second UI
  // slot is useful for editing, but it is not authored choreography until the
  // pairing or its timing changes.
  let linkedPartnerIsSynthetic = $state(
    (initial?.performers.length ?? 0) === 1 && mode === "linked"
  );
  let relationship = $state<TunnelRelationshipRule>({
    ...(initialSlots[1]?.performer?.source.kind === "derived"
      ? tunnelRelationshipFromOps(initialSlots[1].performer.source.transforms)
      : (restoredDraft?.relationship ?? DEFAULT_TUNNEL_RELATIONSHIP)),
  });
  let formation = $state<TunnelConfig>({
    ...(initial?.formation ?? dependencies.initialFormation ?? DEFAULT_CONFIG),
    speedOverrides: {
      ...(initial?.formation.speedOverrides ??
        dependencies.initialFormation?.speedOverrides ??
        DEFAULT_CONFIG.speedOverrides),
    },
  });
  let stage = $state<TunnelStage>(
    initial?.stage
      ? cloneTunnelStage(initial.stage)
      : createExplicitTunnelStage([], formation)
  );
  let pickerTarget = $state<TunnelPickerTarget | null>(null);
  let pairingTargetId = $state<string | null>(initialSlots[1]?.id ?? null);
  let opening = $state(false);
  const restoredGenerationTarget =
    restoredDraft?.workspace.generationTargetId &&
    initialSlots.some(
      (slot) => slot.id === restoredDraft.workspace.generationTargetId
    )
      ? restoredDraft.workspace.generationTargetId
      : null;
  const restoredPanel = restoredDraft?.workspace.activePanel ?? null;
  let activePanel = $state<TunnelWorkspacePanel>(
    restoredPanel === "generation" && !restoredGenerationTarget
      ? null
      : restoredPanel
  );
  let generationTargetId = $state<string | null>(
    activePanel === "generation" ? restoredGenerationTarget : null
  );
  let selectedPerformerId = $state<string | null>(
    generationTargetId ?? initialSlots[0]!.id
  );

  function currentLead(): TunnelPerformer | null {
    return slots[0]?.performer ?? null;
  }

  function currentPartner(): TunnelPerformer | null {
    return slots[1]?.performer ?? null;
  }

  function inferWorkflow(
    performers: readonly TunnelPerformer[]
  ): TunnelWorkflowMode {
    if (performers.length < 2) return "seeded";
    const leadId = performers[0]?.id;
    return leadId &&
      performers
        .slice(1)
        .every(
          (performer) =>
            performer.source.kind === "derived" &&
            performer.source.performerId === leadId
        )
      ? "seeded"
      : "custom";
  }

  function isReady(): boolean {
    const performers = activePerformers();
    return (
      performers.length > 0 &&
      slots.every((slot) => slot.performer !== null) &&
      imageCount(formation) >= performers.length
    );
  }

  function normalizeSlotLabels(
    nextSlots: TunnelPerformerSlot[]
  ): TunnelPerformerSlot[] {
    return nextSlots.map((slot, index) => {
      const label = `Performer ${index + 1}`;
      return {
        ...slot,
        label,
        performer: slot.performer ? { ...slot.performer, label } : null,
      };
    });
  }

  function performerFromIndependentSource(
    slot: TunnelPerformerSlot,
    sequence: SequenceData
  ): TunnelPerformer {
    const performer = createIndependentTunnelPerformer(
      sequence,
      Math.max(
        0,
        slots.findIndex((candidate) => candidate.id === slot.id)
      ),
      slot.label,
      {
        ...(slot.sourceSequenceId
          ? { sourceSequenceId: slot.sourceSequenceId }
          : {}),
        ...(slot.provenance ? { provenance: slot.provenance } : {}),
      }
    );
    performer.id = slot.id;
    performer.timing = { ...slot.timing };
    return performer;
  }

  function derivedPerformer(
    source: TunnelPerformer,
    target: TunnelPerformerSlot
  ): TunnelPerformer {
    const performer = createDerivedTunnelPerformer(
      source.id,
      Math.max(
        0,
        slots.findIndex((candidate) => candidate.id === target.id)
      ),
      tunnelRelationshipOps(target.relationship),
      target.label
    );
    performer.id = target.id;
    performer.timing = { ...target.timing };
    return performer;
  }

  function rebuildDerivedPerformer(targetId: string): void {
    const target = slots.find((slot) => slot.id === targetId);
    if (!target?.performer || target.performer.source.kind !== "derived")
      return;
    const sourcePerformerId = target.performer.source.performerId;
    const source = slots.find((slot) => slot.id === sourcePerformerId)
      ?.performer;
    const performer = source ? derivedPerformer(source, target) : null;
    slots = slots.map((slot) =>
      slot.id === targetId ? { ...slot, performer } : slot
    );
  }

  function rebuildDerivedDependants(sourceId: string): void {
    const dependants = slots.filter(
      (slot) =>
        slot.performer?.source.kind === "derived" &&
        slot.performer.source.performerId === sourceId
    );
    for (const dependant of dependants) rebuildDerivedPerformer(dependant.id);
  }

  function rebuildLinkedPartner(): void {
    const source = slots[0]?.performer;
    const target = slots[1];
    if (!target) return;
    const nextTarget = {
      ...target,
      relationship: { ...relationship },
      performer:
        target.performer?.source.kind === "derived"
          ? target.performer
          : source
            ? createDerivedTunnelPerformer(
                source.id,
                1,
                tunnelRelationshipOps(relationship),
                target.label
              )
            : null,
    };
    if (nextTarget.performer) {
      nextTarget.performer.id = target.id;
      nextTarget.performer.timing = { ...target.timing };
      nextTarget.performer.source = {
        kind: "derived",
        performerId: source?.id ?? slots[0]!.id,
        transforms: tunnelRelationshipOps(relationship),
      };
    }
    slots = slots.map((slot, index) => (index === 1 ? nextTarget : slot));
  }

  // A restored cast can be shorter than the slots the creator shows: a tunnel
  // saved before the creator existed holds exactly the one sequence it was
  // built from, and the rest of its arms came from the formation. Synthesizing
  // the partner here — through the same linked rule the pairing controls edit
  // — is what makes that tunnel editable at all, since a slot with no performer
  // leaves the creator permanently not-ready.
  if (mode === "linked" && slots[0]?.performer && !slots[1]?.performer) {
    rebuildLinkedPartner();
  }

  function replaceIndependentSequence(
    targetId: string,
    sequence: SequenceData,
    origin: TunnelSourceOrigin,
    rememberCurrent: boolean,
    source: {
      sourceSequenceId?: string;
      provenance?: TunnelSourceProvenance;
    } = {}
  ): boolean {
    const slot = slots.find((candidate) => candidate.id === targetId);
    if (!slot) return false;

    const isSameSource = slot.independentSequence?.id === sequence.id;
    const slotIndex = slots.indexOf(slot);
    const previous =
      rememberCurrent && slot.independentSequence && !isSameSource
        ? [
            ...slot.previous,
            {
              sequence: slot.independentSequence,
              origin: slot.origin ?? "picked",
              ...(slot.sourceSequenceId
                ? { sourceSequenceId: slot.sourceSequenceId }
                : {}),
              ...(slot.provenance ? { provenance: slot.provenance } : {}),
            },
          ].slice(-MAX_SOURCE_HISTORY)
        : slot.previous;
    const nextSlot: TunnelPerformerSlot = {
      ...slot,
      independentSequence: sequence,
      origin,
      sourceSequenceId: source.sourceSequenceId ?? sequence.id,
      provenance: source.provenance ?? null,
      previous,
    };
    if (slotIndex > 0) workflow = "custom";
    const performer =
      slotIndex !== 1 || mode !== "linked" || workflow === "custom"
        ? performerFromIndependentSource(nextSlot, sequence)
        : slot.performer;
    if (slotIndex === 1 && performer?.source.kind === "independent") {
      mode = "separate";
      linkedPartnerIsSynthetic = false;
    }

    slots = slots.map((candidate, index) =>
      index === slotIndex
        ? {
            ...nextSlot,
            performer,
          }
        : candidate
    );

    if (slots[0]?.id === targetId && mode === "linked") {
      rebuildLinkedPartner();
    } else if (slotIndex === 1 && mode === "linked") {
      rebuildLinkedPartner();
    }
    rebuildDerivedDependants(targetId);
    reconcileStageWithPerformers();
    return true;
  }

  function setPerformerSequence(
    targetId: string,
    sequence: SequenceData,
    origin: TunnelSourceOrigin = "picked",
    source: {
      sourceSequenceId?: string;
      provenance?: TunnelSourceProvenance;
    } = {}
  ): boolean {
    return replaceIndependentSequence(targetId, sequence, origin, true, source);
  }

  function setLeadSequence(sequence: SequenceData): void {
    const targetId = slots[0]?.id;
    if (targetId) setPerformerSequence(targetId, sequence, "picked");
  }

  function setPartnerSequence(sequence: SequenceData): void {
    const targetId = slots[1]?.id;
    if (targetId) setPerformerSequence(targetId, sequence, "picked");
  }

  function restorePreviousSequence(targetId: string): boolean {
    const slot = slots.find((candidate) => candidate.id === targetId);
    const previous = slot?.previous.at(-1);
    if (!slot || !previous) return false;
    slots = slots.map((candidate) =>
      candidate.id === targetId
        ? { ...candidate, previous: candidate.previous.slice(0, -1) }
        : candidate
    );
    return replaceIndependentSequence(
      targetId,
      previous.sequence,
      previous.origin,
      false,
      {
        ...(previous.sourceSequenceId
          ? { sourceSequenceId: previous.sourceSequenceId }
          : {}),
        ...(previous.provenance ? { provenance: previous.provenance } : {}),
      }
    );
  }

  function addPerformer(): string | null {
    if (slots.length >= MAX_INTERACTIVE_TUNNEL_PERFORMERS) return null;
    if (!ensureFormationCapacity(slots.length + 1)) return null;
    const slot = createSlot(slots.length);
    slots = [...slots, slot];
    if (workflow === "seeded" && slots[0]?.performer) {
      seedPerformer(slot.id, slots.length - 1, slots.length);
    }
    reconcileStageWithPerformers();
    selectedPerformerId = slot.id;
    return slot.id;
  }

  function ensureFormationCapacity(count: number): boolean {
    if (imageCount(formation) >= count) return true;
    const multiplier = (formation.mirror ? 2 : 1) * (formation.flip ? 2 : 1);
    const fold = FOLD_OPTIONS.find((option) => option * multiplier >= count);
    if (!fold) return false;
    formation = { ...formation, fold };
    return true;
  }

  function seedPerformer(
    targetId: string,
    index: number,
    castCount: number
  ): boolean {
    const lead = slots[0]?.performer;
    if (!lead || index <= 0) return false;
    const target = slots.find((slot) => slot.id === targetId);
    if (!target) return false;
    const length = Math.max(
      1,
      lead.source.kind === "independent" ? lead.source.sequence.steps.length : 1
    );
    const seededRelationship = { ...DEFAULT_TUNNEL_RELATIONSHIP };
    const timing = {
      stepOffset: Math.floor((length * index) / Math.max(1, castCount)),
      speed: 1,
    };
    const seededTarget = {
      ...target,
      relationship: seededRelationship,
      timing,
    };
    const performer = derivedPerformer(lead, seededTarget);
    slots = slots.map((slot) =>
      slot.id === targetId
        ? { ...seededTarget, performer, origin: null, provenance: null }
        : slot
    );
    if (index === 1) {
      mode = "linked";
      relationship = { ...seededTarget.relationship };
      linkedPartnerIsSynthetic = false;
    }
    return true;
  }

  function setWorkflow(next: TunnelWorkflowMode): void {
    if (workflow === next) return;
    workflow = next;
    if (next !== "seeded" || !slots[0]?.performer) return;
    const count = slots.length;
    for (let index = 1; index < count; index += 1) {
      const targetId = slots[index]?.id;
      if (targetId) seedPerformer(targetId, index, count);
    }
    reconcileStageWithPerformers();
  }

  function setPerformerCount(requested: number): boolean {
    const count = Math.max(
      1,
      Math.min(MAX_INTERACTIVE_TUNNEL_PERFORMERS, Math.round(requested))
    );
    if (count === slots.length) return true;
    if (!ensureFormationCapacity(count)) return false;

    if (count < slots.length) {
      const removedIds = new Set(slots.slice(count).map((slot) => slot.id));
      const retained = slots.slice(0, count);
      if (
        retained.some(
          (slot) =>
            slot.performer?.source.kind === "derived" &&
            removedIds.has(slot.performer.source.performerId)
        )
      ) {
        return false;
      }
      slots = normalizeSlotLabels(retained);
      reconcileStageWithPerformers();
      if (!slots.some((slot) => slot.id === selectedPerformerId)) {
        selectedPerformerId = slots.at(-1)?.id ?? null;
      }
      pairingTargetId = slots[1]?.id ?? null;
      linkedPartnerIsSynthetic = false;
      return true;
    }

    while (slots.length < count) {
      const slot = createSlot(slots.length);
      slots = [...slots, slot];
    }
    if (workflow === "seeded" && slots[0]?.performer) {
      for (let index = 1; index < count; index += 1) {
        const targetId = slots[index]?.id;
        if (targetId) seedPerformer(targetId, index, count);
      }
    }
    reconcileStageWithPerformers();
    selectedPerformerId = slots.at(-1)?.id ?? selectedPerformerId;
    return true;
  }

  function dependantLabels(targetId: string): string[] {
    return slots
      .filter(
        (slot) =>
          slot.performer?.source.kind === "derived" &&
          slot.performer.source.performerId === targetId
      )
      .map((slot) => slot.label);
  }

  function removePerformer(targetId: string): boolean {
    const index = slots.findIndex((slot) => slot.id === targetId);
    if (
      index < 0 ||
      slots.length <= 1 ||
      dependantLabels(targetId).length > 0
    ) {
      return false;
    }
    slots = normalizeSlotLabels(slots.filter((slot) => slot.id !== targetId));
    reconcileStageWithPerformers();
    if (selectedPerformerId === targetId) {
      selectedPerformerId = slots[Math.min(index, slots.length - 1)]!.id;
    }
    if (pairingTargetId === targetId) {
      pairingTargetId = slots[1]?.id ?? null;
      if (activePanel === "pairing") activePanel = null;
    }
    if (generationTargetId === targetId) {
      generationTargetId = null;
      if (activePanel === "generation") activePanel = null;
    }
    mode =
      slots[1]?.performer?.source.kind === "derived" ? "linked" : "separate";
    relationship = {
      ...(slots[1]?.relationship ?? DEFAULT_TUNNEL_RELATIONSHIP),
    };
    linkedPartnerIsSynthetic = false;
    return true;
  }

  function canMovePerformer(targetId: string, direction: -1 | 1): boolean {
    const index = slots.findIndex((slot) => slot.id === targetId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= slots.length) return false;
    const reordered = [...slots];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return false;
    reordered.splice(nextIndex, 0, moved);
    const positions = new Map(
      reordered.map((slot, position) => [slot.id, position])
    );
    return reordered.every((slot, position) => {
      if (slot.performer?.source.kind !== "derived") return true;
      const sourcePosition = positions.get(slot.performer.source.performerId);
      return sourcePosition !== undefined && sourcePosition < position;
    });
  }

  function movePerformer(targetId: string, direction: -1 | 1): boolean {
    if (!canMovePerformer(targetId, direction)) return false;
    const index = slots.findIndex((slot) => slot.id === targetId);
    const reordered = [...slots];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return false;
    reordered.splice(index + direction, 0, moved);
    slots = normalizeSlotLabels(reordered);
    mode =
      slots[1]?.performer?.source.kind === "derived" ? "linked" : "separate";
    relationship = {
      ...(slots[1]?.relationship ?? DEFAULT_TUNNEL_RELATIONSHIP),
    };
    linkedPartnerIsSynthetic = false;
    return true;
  }

  function setPerformerSource(
    targetId: string,
    sourcePerformerId: string | null
  ): boolean {
    const targetIndex = slots.findIndex((slot) => slot.id === targetId);
    const target = slots[targetIndex];
    if (!target || targetIndex === 0) return false;

    if (sourcePerformerId === null) {
      workflow = "custom";
      const performer = target.independentSequence
        ? performerFromIndependentSource(target, target.independentSequence)
        : null;
      slots = slots.map((slot) =>
        slot.id === targetId ? { ...slot, performer } : slot
      );
      if (targetIndex === 1) mode = "separate";
      if (targetIndex === 1) linkedPartnerIsSynthetic = false;
      reconcileStageWithPerformers();
      return true;
    }

    const sourceIndex = slots.findIndex(
      (slot) => slot.id === sourcePerformerId
    );
    const source = slots[sourceIndex]?.performer;
    if (!source || sourceIndex < 0 || sourceIndex >= targetIndex) return false;
    if (sourceIndex !== 0) workflow = "custom";
    const performer = derivedPerformer(source, target);
    slots = slots.map((slot) =>
      slot.id === targetId ? { ...slot, performer } : slot
    );
    if (targetIndex === 1) {
      mode = "linked";
      relationship = { ...target.relationship };
      linkedPartnerIsSynthetic = false;
    }
    reconcileStageWithPerformers();
    return true;
  }

  function setMode(next: TunnelCreatorMode): void {
    if (mode === next) return;
    linkedPartnerIsSynthetic = false;
    mode = next;
    if (next === "separate") workflow = "custom";
    if (
      next === "separate" &&
      activePanel === "pairing" &&
      pairingTargetId === slots[1]?.id
    ) {
      activePanel = null;
    }
    const target = slots[1];
    if (!target) return;

    if (next === "linked") {
      rebuildLinkedPartner();
      reconcileStageWithPerformers();
      return;
    }

    const performer = target.independentSequence
      ? performerFromIndependentSource(target, target.independentSequence)
      : null;
    slots = slots.map((slot, index) =>
      index === 1 ? { ...slot, performer } : slot
    );
    reconcileStageWithPerformers();
  }

  function setRelationship(patch: Partial<TunnelRelationshipRule>): void {
    const targetId = pairingTargetId ?? slots[1]?.id;
    if (!targetId) return;
    const targetIndex = slots.findIndex((slot) => slot.id === targetId);
    const target = slots[targetIndex];
    if (!target) return;
    const nextRelationship = updateTunnelRelationship(
      target.relationship,
      patch
    );
    slots = slots.map((slot) =>
      slot.id === targetId ? { ...slot, relationship: nextRelationship } : slot
    );
    if (targetIndex === 1) {
      linkedPartnerIsSynthetic = false;
      relationship = { ...nextRelationship };
    }
    rebuildDerivedPerformer(targetId);
    reconcileStageWithPerformers();
  }

  function setPerformerTiming(
    targetId: string,
    patch: Partial<TunnelPerformer["timing"]>
  ): void {
    const slotIndex = slots.findIndex((slot) => slot.id === targetId);
    const slot = slots[slotIndex];
    if (!slot) return;
    if (slotIndex === 1) linkedPartnerIsSynthetic = false;
    const timing = {
      ...slot.timing,
      ...patch,
      stepOffset: Math.max(
        0,
        Math.round(patch.stepOffset ?? slot.timing.stepOffset)
      ),
      speed: Math.max(0.25, patch.speed ?? slot.timing.speed),
    };
    const performer = slot.performer
      ? { ...slot.performer, timing: { ...timing } }
      : null;
    slots = slots.map((candidate) =>
      candidate.id === targetId
        ? { ...candidate, timing, performer }
        : candidate
    );
    reconcileStageWithPerformers();
  }

  function setPartnerTiming(patch: Partial<TunnelPerformer["timing"]>): void {
    const targetId = slots[1]?.id;
    if (targetId) setPerformerTiming(targetId, patch);
  }

  function setFormation(next: TunnelConfig): boolean {
    if (configKey(next) === configKey(formation)) return true;
    const fitted = fitTunnelStageToFormation(stage, next);
    if (!fitted) return false;
    formation = {
      ...next,
      speedOverrides: { ...next.speedOverrides },
    };
    stage = fitted;
    return true;
  }

  function openWorkspacePanel(
    panel: Exclude<TunnelWorkspacePanel, "generation" | null>
  ): void {
    if (panel === "pairing" && !pairingTargetId) {
      pairingTargetId = slots[1]?.id ?? null;
    }
    activePanel = panel;
    generationTargetId = null;
  }

  function openPairingPanel(targetId: string): boolean {
    const targetIndex = slots.findIndex((slot) => slot.id === targetId);
    if (targetIndex <= 0) return false;
    pairingTargetId = targetId;
    selectedPerformerId = targetId;
    activePanel = "pairing";
    generationTargetId = null;
    return true;
  }

  function openGenerationPanel(targetId: string): boolean {
    if (!selectGenerationTarget(targetId)) return false;
    activePanel = "generation";
    return true;
  }

  function selectGenerationTarget(targetId: string): boolean {
    if (!slots.some((slot) => slot.id === targetId)) return false;
    generationTargetId = targetId;
    selectedPerformerId = targetId;
    return true;
  }

  function closeWorkspacePanel(): void {
    activePanel = null;
    generationTargetId = null;
  }

  function activePerformers(): TunnelPerformer[] {
    return slots
      .map((slot, index) =>
        linkedPartnerIsSynthetic && index === 1 ? null : slot.performer
      )
      .filter((performer): performer is TunnelPerformer => performer !== null);
  }

  /** Keep the visible stage honest as authored choreography is added or removed. */
  function reconcileStageWithPerformers(): void {
    const performers = activePerformers();
    const performerIds = new Set(performers.map((performer) => performer.id));
    const instances = stage.instances
      .filter((instance) => performerIds.has(instance.performerId))
      .map((instance) => ({ ...instance }));
    const appearancesByPerformer = new Map<string, number>();
    for (const instance of instances) {
      appearancesByPerformer.set(
        instance.performerId,
        (appearancesByPerformer.get(instance.performerId) ?? 0) + 1
      );
    }

    for (const performer of performers) {
      if ((appearancesByPerformer.get(performer.id) ?? 0) > 0) continue;
      const reusable = [...instances]
        .reverse()
        .find(
          (instance) =>
            (appearancesByPerformer.get(instance.performerId) ?? 0) > 1
        );
      if (reusable) {
        appearancesByPerformer.set(
          reusable.performerId,
          (appearancesByPerformer.get(reusable.performerId) ?? 1) - 1
        );
        reusable.performerId = performer.id;
        appearancesByPerformer.set(performer.id, 1);
        continue;
      }
      instances.push({
        id: `stage-${createId()}`,
        performerId: performer.id,
        arm: 0,
      });
      appearancesByPerformer.set(performer.id, 1);
    }

    if (!ensureFormationCapacity(instances.length)) return;
    const fitted = fitTunnelStageToFormation({ instances }, formation);
    if (fitted) stage = fitted;
  }

  function canRemoveStageInstance(instanceId: string): boolean {
    const instance = stage.instances.find(
      (candidate) => candidate.id === instanceId
    );
    if (!instance) return false;
    return (
      stage.instances.filter(
        (candidate) => candidate.performerId === instance.performerId
      ).length > 1
    );
  }

  function addStageInstance(performerId: string): boolean {
    if (
      !activePerformers().some((performer) => performer.id === performerId) ||
      stage.instances.length >= imageCount(formation)
    ) {
      return false;
    }
    const fitted = fitTunnelStageToFormation(
      {
        instances: [
          ...stage.instances.map((instance) => ({ ...instance })),
          {
            id: `stage-${createId()}`,
            performerId,
            arm: 0,
          },
        ],
      },
      formation
    );
    if (!fitted) return false;
    stage = fitted;
    return true;
  }

  function removeStageInstance(instanceId: string): boolean {
    if (!canRemoveStageInstance(instanceId)) return false;
    const fitted = fitTunnelStageToFormation(
      {
        instances: stage.instances
          .filter((instance) => instance.id !== instanceId)
          .map((instance) => ({ ...instance })),
      },
      formation
    );
    if (!fitted) return false;
    stage = fitted;
    return true;
  }

  function setStageInstancePerformer(
    instanceId: string,
    performerId: string
  ): boolean {
    if (!activePerformers().some((performer) => performer.id === performerId)) {
      return false;
    }
    const current = stage.instances.find(
      (instance) => instance.id === instanceId
    );
    if (!current) return false;
    if (
      current.performerId !== performerId &&
      !canRemoveStageInstance(instanceId)
    ) {
      return false;
    }
    stage = {
      instances: stage.instances.map((instance) =>
        instance.id === instanceId
          ? { ...instance, performerId }
          : { ...instance }
      ),
    };
    return true;
  }

  function compositionWithFormation(
    nextFormation: TunnelConfig = formation
  ): TunnelComposition | null {
    if (!isReady()) return null;
    return previewCompositionWithFormation(nextFormation);
  }

  function previewCompositionWithFormation(
    nextFormation: TunnelConfig = formation
  ): TunnelComposition | null {
    if (!currentLead()) return null;
    const timestamp = now();
    const performers = activePerformers();
    const fittedStage = fitTunnelStageToFormation(stage, nextFormation);
    if (performers.length === 0 || !fittedStage) return null;
    return {
      version: TUNNEL_COMPOSITION_VERSION,
      id: compositionId,
      // Same derivation the viewer's save uses, so a tunnel keeps one name
      // whichever surface it was born on. See tunnel-name.ts.
      name:
        initial?.name ??
        (deriveTunnelName({
          composition: { performers },
          formation: nextFormation,
        }) ||
          "Untitled tunnel"),
      performers,
      stage: cloneTunnelStage(fittedStage),
      formation: {
        ...nextFormation,
        speedOverrides: { ...nextFormation.speedOverrides },
      },
      createdAt,
      updatedAt: timestamp,
    };
  }

  function draftSnapshot(): TunnelCreatorDraft {
    const performers = activePerformers();
    const timestamp = now();
    const fittedStage = fitTunnelStageToFormation(stage, formation);
    const composition =
      performers.length === 0 || !fittedStage
        ? null
        : {
            version: TUNNEL_COMPOSITION_VERSION,
            id: compositionId,
            name:
              initial?.name ??
              (deriveTunnelName({ composition: { performers }, formation }) ||
                "Untitled tunnel"),
            performers,
            stage: cloneTunnelStage(fittedStage),
            formation: {
              ...formation,
              speedOverrides: { ...formation.speedOverrides },
            },
            createdAt,
            updatedAt: timestamp,
          };

    return {
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow,
      mode,
      composition,
      relationship: {
        ...(slots[1]?.relationship ?? relationship),
      },
      sourceStates: slots.map((slot) => ({
        performerId: slot.id,
        label: slot.label,
        independentSequence: slot.independentSequence,
        origin: slot.origin,
        sourceSequenceId: slot.sourceSequenceId,
        provenance: slot.provenance,
        previous: slot.previous.map((entry) => ({ ...entry })),
      })),
      workspace: { activePanel, generationTargetId },
      editingTunnel:
        dependencies.editingTunnel ?? restoredDraft?.editingTunnel ?? null,
      presentation: dependencies.presentation.capture(),
    };
  }

  async function openInViewer(nextFormation: TunnelConfig): Promise<void> {
    const composition = compositionWithFormation(nextFormation);
    if (!composition || opening) return;
    opening = true;
    try {
      dependencies.openComposition(
        composition,
        dependencies.presentation.capture()
      );
    } finally {
      opening = false;
    }
  }

  return {
    get workflow() {
      return workflow;
    },
    get mode() {
      return mode;
    },
    get lead() {
      return currentLead();
    },
    get partner() {
      return currentPartner();
    },
    /** The visible linked partner reconstructs a legacy formation arm. It is
     * useful for inspecting the performed result, but remains un-authored
     * until pairing or timing is deliberately changed. */
    get partnerIsFormationCopy() {
      return linkedPartnerIsSynthetic;
    },
    get leadSequence() {
      const lead = currentLead();
      return lead?.source.kind === "independent" ? lead.source.sequence : null;
    },
    get partnerSequence() {
      const partner = currentPartner();
      return partner?.source.kind === "independent"
        ? partner.source.sequence
        : null;
    },
    get relationship() {
      return (
        slots.find((slot) => slot.id === pairingTargetId)?.relationship ??
        slots[1]?.relationship ??
        relationship
      );
    },
    get relationshipOps() {
      return tunnelRelationshipOps(
        slots.find((slot) => slot.id === pairingTargetId)?.relationship ??
          slots[1]?.relationship ??
          relationship
      );
    },
    get pickerTarget() {
      return pickerTarget;
    },
    get activePanel() {
      return activePanel;
    },
    get generationTargetId() {
      return generationTargetId;
    },
    get pairingTargetId() {
      return pairingTargetId;
    },
    get pairingTarget() {
      return slots.find((slot) => slot.id === pairingTargetId) ?? null;
    },
    get pairingSourceCandidates() {
      const targetIndex = slots.findIndex(
        (slot) => slot.id === pairingTargetId
      );
      if (targetIndex <= 0) return [];
      return slots
        .slice(0, targetIndex)
        .flatMap((slot) =>
          slot.performer ? [{ id: slot.id, label: slot.label }] : []
        );
    },
    get selectedPerformerId() {
      return selectedPerformerId;
    },
    get authoredPerformerCount() {
      return activePerformers().length;
    },
    get formationCapacity() {
      return imageCount(formation);
    },
    get stageInstances() {
      return stage.instances.map((instance) => ({ ...instance }));
    },
    get renderedInstanceCount() {
      return stage.instances.length;
    },
    get canAddStageInstance() {
      return (
        activePerformers().length > 0 &&
        stage.instances.length < imageCount(formation)
      );
    },
    get canAddPerformer() {
      return slots.length < MAX_INTERACTIVE_TUNNEL_PERFORMERS;
    },
    get addPerformerBlockedReason() {
      if (slots.length >= MAX_INTERACTIVE_TUNNEL_PERFORMERS) {
        return slots.length > MAX_INTERACTIVE_TUNNEL_PERFORMERS
          ? `${slots.length} legacy performers are preserved. New Tunnel casts use up to four.`
          : "Tunnel casts can contain up to four authored performers.";
      }
      return null;
    },
    get ready() {
      return isReady();
    },
    get opening() {
      return opening;
    },
    get initialFormation() {
      return formation;
    },
    get editingTunnel() {
      return dependencies.editingTunnel ?? restoredDraft?.editingTunnel ?? null;
    },
    get presentation() {
      return dependencies.presentation;
    },
    get performerSlots() {
      return slots.map((slot) => ({
        id: slot.id,
        label: slot.label,
        performer: slot.performer,
        origin: slot.origin,
        previousCount: slot.previous.length,
        relationship: { ...slot.relationship },
      }));
    },
    performerIdAt(index: number) {
      return slots[index]?.id ?? null;
    },
    sourceOrigin(targetId: string) {
      return slots.find((slot) => slot.id === targetId)?.origin ?? null;
    },
    previousCount(targetId: string) {
      return slots.find((slot) => slot.id === targetId)?.previous.length ?? 0;
    },
    dependantLabels,
    canRemovePerformer(targetId: string) {
      return (
        slots.length > 1 &&
        slots.some((slot) => slot.id === targetId) &&
        dependantLabels(targetId).length === 0
      );
    },
    canMovePerformer,
    canRemoveStageInstance,
    selectPerformer(targetId: string) {
      if (!slots.some((slot) => slot.id === targetId)) return false;
      selectedPerformerId = targetId;
      return true;
    },
    addPerformer,
    addStageInstance,
    setPerformerCount,
    setWorkflow,
    removePerformer,
    removeStageInstance,
    movePerformer,
    setPerformerSource,
    setStageInstancePerformer,
    setMode,
    setPerformerSequence,
    setLeadSequence,
    setPartnerSequence,
    restorePreviousSequence,
    setRelationship,
    setPerformerTiming,
    setPartnerTiming,
    setFormation,
    openWorkspacePanel,
    openPairingPanel,
    openGenerationPanel,
    selectGenerationTarget,
    closeWorkspacePanel,
    openPicker(target: TunnelPickerTarget) {
      if (slots.some((slot) => slot.id === target)) pickerTarget = target;
    },
    closePicker() {
      pickerTarget = null;
    },
    compositionWithFormation,
    previewCompositionWithFormation,
    draftSnapshot,
    openInViewer,
  };
}

export type TunnelCreatorState = ReturnType<typeof createTunnelCreatorState>;
