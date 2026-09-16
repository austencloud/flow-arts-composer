<!--
  PipelineEditorDock.svelte

  Selection-driven footer editor for the PictographInspectModal. Relocates the
  arrow-adjustment editor out of the per-color PipelineTraceSection so columns
  stay fixed height and the modal never resizes. Binds to the global selected
  arrow; idle until an arrow is selected.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type {
    PipelineDiagnostics,
    PipelineTier,
  } from "$lib/shared/pictograph/arrow/positioning/calculation/domain/pipeline-diagnostics";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import type { SelectedArrowContext } from "../../../services/arrow-adjustment-orchestrator";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { globalAdjustmentVersion } from "$lib/shared/pictograph/arrow/positioning/global/state/global-adjustment-version.svelte";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import { getSpecialOverrideRepository } from "$lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton";
  import {
    parseSpecialOverrideKey,
    type SpecialArrowPlacementInput,
  } from "$lib/shared/pictograph/arrow/positioning/special-override/domain/special-arrow-placement";
  import { getDefaultOverrideRepository } from "$lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton";
  import { livePipelineEdit } from "./live-pipeline-edit.svelte";
  import DefaultArrowAdjustmentHistory from "./DefaultArrowAdjustmentHistory.svelte";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";
  import { Point } from "fabric";
  import { screenSpaceAdjustmentTransformer } from "$lib/shared/pictograph/arrow/positioning/calculation/services/screen-space-adjustment-transformer";
  import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
  import { computeSpecialOverrideKey } from "$lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    createCanonicalPlacementContext,
    rotateScreenVectorToCanonical,
  } from "$lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  const logger = createComponentLogger("PipelineEditorDock");

  interface Props {
    stepData: StepData;
    leftDiagnostics: PipelineDiagnostics | null;
    rightDiagnostics: PipelineDiagnostics | null;
    onDiagnosticsChanged?: () => void;
    /** When set, the dock shows a single "Done" button (instead of Save) that
        persists the current edit then calls this — for one-shot flows like the
        choreo-card Fix Arrows surface, where the user edits one pictograph and
        wants to commit + leave in one click. */
    onDone?: () => void;
  }
  let {
    stepData,
    leftDiagnostics,
    rightDiagnostics,
    onDiagnosticsChanged,
    onDone,
  }: Props = $props();

  // Selection-driven binding (live re-bind on hand switch)
  const activeHand = $derived<HandSideValue | null>(
    (selectedArrowState.selectedArrow?.hand as HandSideValue | undefined) ??
      null
  );
  const diagnostics = $derived(
    activeHand === HandSide.RIGHT ? rightDiagnostics : leftDiagnostics
  );

  let editTarget = $state<"special-json" | "default">("special-json");
  let editX = $state(0);
  let editY = $state(0);
  let hasLocalChanges = $state(false);
  let saveState = $state<"idle" | "saving" | "saved">("idle");
  // Two-step confirm for the app-wide special suppression. The key has no
  // per-step identity, so this one click changes every pictograph that resolves
  // to it — the confirm names exactly what it hits before it fires.
  let pendingSuppress = $state(false);

  // A tombstone hides the whole Special tier for this key. The diagnostics still
  // report the tier's static value (struck through in the trace), so the row is
  // the entry point for Restore.
  const specialSuppressed = $derived(
    diagnostics?.specialJson?.suppressed === true
  );

  // The tier actually winning, when it isn't the one being edited. Generic on
  // purpose: Special-shadows-Default is the case that prompted this, but
  // Global-shadows-Special and Prop-Geometry-shadow-Default read identically
  // to a user and would otherwise reproduce the same silent confusion.
  const shadowedBy = $derived.by((): PipelineTier | null => {
    if (!diagnostics || !activeHand) return null;
    const active = diagnostics.activeTier;
    // Rank, not inequality: a LOWER-priority active tier means the tier being
    // edited is simply empty (editing Special on a letter with no special entry),
    // which is normal and needs no warning. Only an outranking tier shadows.
    return TIER_RANK[active] < TIER_RANK[editTarget] ? active : null;
  });

  // Only offer removal when the Special tier is what's in the way of Default.
  const canRemoveSpecial = $derived(
    editTarget === "default" && diagnostics?.specialJson != null
  );

  // Head identity derived
  const handName = $derived(activeHand === HandSide.RIGHT ? "Right" : "Left");
  const colorToken = $derived(
    activeHand === HandSide.RIGHT
      ? "var(--prop-red, #f85149)"
      : "var(--prop-blue, #58a6ff)"
  );
  const segColor = $derived<"blue" | "red">(
    activeHand === HandSide.RIGHT ? "red" : "blue"
  );

  // Publish the in-flight edit so PipelineTraceSection can show the edited tier's
  // value live (before Save). Only while an actual edit is pending on this color;
  // cleared on Save/tier-switch/deselect (hasLocalChanges resets) and on teardown.
  $effect(() => {
    if (hasLocalChanges && activeHand) {
      livePipelineEdit.publish({
        hand: activeHand,
        tier: editTarget,
        x: editX,
        y: editY,
      });
    } else {
      livePipelineEdit.clear();
    }
    return () => livePipelineEdit.clear();
  });

  // Mirrors the tier priority in ArrowAdjustmentCalculator.getDiagnostics.
  const TIER_RANK: Record<PipelineTier, number> = {
    global: 0,
    "special-json": 1,
    "prop-geometry": 2,
    default: 3,
  };

  const tierOptions = [
    { value: "special-json" as const, label: "Special JSON" },
    { value: "default" as const, label: "Default" },
  ];

  // Invisible placeholder hands keep the dock inert — WASD-adjusting a
  // fabricated motion would write special-placement overrides keyed off
  // placeholder data (Wave 0 straggler fix: dead presence gate).
  const selectedArrowContext = $derived.by((): SelectedArrowContext | null => {
    if (!activeHand) return null;
    const motion = stepData.motions?.[activeHand];
    if (!isVisibleMotion(motion)) return null;
    const pictographData: PictographData = {
      id: stepData.id,
      letter: stepData.letter ?? null,
      startPlacement: stepData.startPlacement,
      endPlacement: stepData.endPlacement,
      motions: stepData.motions as PictographData["motions"],
    };
    return { motionData: motion, hand: activeHand, pictographData };
  });

  // The arrow's calculated grid location — needed to invert the per-quadrant
  // directional-tuple matrix so a pressed screen direction maps to the right
  // reference-space delta (correct even for 90°/270° rotated quadrants).
  const arrowLocation = $derived.by((): GridLocation | null => {
    const c = activeHand;
    if (!c) return null;
    const motion = stepData.motions?.[c];
    const pd = selectedArrowContext?.pictographData;
    if (!motion || !pd) return null;
    return arrowLocationCalculator.calculateLocation(motion, pd);
  });

  const thisPropType = $derived.by(() => {
    // The step's stamped motion.propType (the deck's effective prop, injected by
    // withEffectivePropTypes) wins over global settings — so fixing arrows on a
    // fan/club deck card shows the right prop and the Default-tier label matches
    // the key computeSpecialOverrideKey writes (which reads motion.propType).
    const c = activeHand ?? HandSide.LEFT;
    const motion = stepData.motions?.[c];
    const settings = getSettings();
    const settingsPropType =
      c === HandSide.LEFT ? settings.leftPropType : settings.rightPropType;
    return (motion?.propType ?? settingsPropType)?.toLowerCase() || "staff";
  });

  // THE canonical key, identical to what the renderer reads (write-key ===
  // read-key by construction). Includes the prop-scoped propType segment.
  const specialOverrideKey = $derived.by((): string | null => {
    const c = activeHand ?? HandSide.LEFT;
    const motion = stepData.motions?.[c];
    if (!motion || !stepData.letter) return null;
    const pd: PictographData = selectedArrowContext?.pictographData ?? {
      id: stepData.id,
      letter: stepData.letter,
      startPlacement: stepData.startPlacement,
      endPlacement: stepData.endPlacement,
      motions: stepData.motions as PictographData["motions"],
    };
    return computeSpecialOverrideKey(pd, motion, c);
  });

  // The Default-tier lookup identity, surfaced by the diagnostics producer.
  const defaultLookup = $derived.by(
    (): {
      placementFrame: string;
      propType: string;
      motionType: string;
      placementKey: string;
      turns: string;
    } | null => {
      if (!diagnostics?.default) return null;
      const d = diagnostics.default;
      if (!d.placementFrame || !d.motionType || !d.placementKey) return null;
      return {
        placementFrame: d.placementFrame,
        propType: d.propType,
        motionType: d.motionType,
        placementKey: d.placementKey,
        turns: d.turns,
      };
    }
  );

  // Reactive "an override exists here" flag for the Revert button.
  const defaultHasValue = $derived.by(() => {
    const _ = globalAdjustmentVersion.version;
    const lk = defaultLookup;
    if (!lk) return false;
    return (
      getDefaultOverrideRepository()?.hasValue(
        lk.placementFrame,
        lk.propType,
        lk.motionType,
        lk.placementKey,
        lk.turns
      ) ?? false
    );
  });

  const dockTitleText = $derived(
    editTarget === "default"
      ? `${handName} · ${thisPropType} · Default`
      : `${handName} · ${tierLabel(editTarget)}`
  );

  function tierLabel(tier: PipelineTier): string {
    switch (tier) {
      case "global":
        return "Global Override";
      case "special-json":
        return "Special JSON";
      case "prop-geometry":
        return "Prop Geometry";
      case "default":
        return "Default";
    }
  }

  function defaultEditTargetForActiveTier(): "special-json" | "default" {
    // Special is the canonical editable tier now — always default to it.
    return "special-json";
  }

  // Re-bind on hand switch (replaces old enterEditMode/toggleEditing).
  let lastBoundColor: HandSideValue | null = null;
  $effect(() => {
    const c = activeHand;
    if (c === lastBoundColor) return;
    lastBoundColor = c;
    if (!c) {
      saveState = "idle";
      hasLocalChanges = false;
      return;
    }
    editTarget = defaultEditTargetForActiveTier();
    hasLocalChanges = false;
    saveState = "idle";
    pendingSuppress = false;
    syncNumericInputs();
  });

  // Re-seed the numeric inputs from the stored value whenever the pipeline
  // diagnostics refresh (after a Z-revert, Save, or delete) — but never while a
  // WASD/numeric edit is in flight. Without this, reverting leaves editX/editY at
  // the pre-revert value, so the next nudge resumes from the stale spot instead
  // of the reverted baseline.
  $effect(() => {
    void diagnostics; // re-run when diagnostics change
    if (!activeHand || hasLocalChanges || saveState === "saving") return;
    syncNumericInputs();
  });

  function syncNumericInputs() {
    if (editTarget === "special-json") {
      const repo = getSpecialOverrideRepository();
      const override =
        repo?.isInitialized && specialOverrideKey
          ? repo.getOverride(specialOverrideKey)
          : null;
      if (override) {
        editX = override.x;
        editY = override.y;
      } else if (diagnostics) {
        // No Special override yet — seed from the CURRENT effective base (the
        // value the arrow renders from now, whatever tier wins). Seeding from 0
        // instead would make the first nudge REPLACE a large baseline with a
        // fresh (0,0)+delta override, snapping the arrow across the grid. Both
        // editX/editY and baseAdjustment are reference-space (pre-tuple), so the
        // seeded override reproduces the current position and the first nudge
        // just adds the delta.
        editX = diagnostics.baseAdjustment.x;
        editY = diagnostics.baseAdjustment.y;
      } else {
        editX = 0;
        editY = 0;
      }
    } else if (editTarget === "default") {
      // diagnostics.default.value is already Firestore-first (resolver-sourced),
      // so it reflects any existing override; seed the inputs from it.
      if (diagnostics?.default) {
        editX = diagnostics.default.value.x;
        editY = diagnostics.default.value.y;
      } else {
        editX = 0;
        editY = 0;
      }
    }
  }

  function selectEditTarget(tier: "special-json" | "default") {
    editTarget = tier;
    hasLocalChanges = false;
    saveState = "idle";
    pendingSuppress = false;
    syncNumericInputs();
  }

  // What the suppression actually hits, in the user's terms. The key carries no
  // per-step identity, so every pictograph matching these five facets is affected.
  const suppressScopeText = $derived.by((): string => {
    const fields = specialOverrideKey
      ? parseSpecialOverrideKey(specialOverrideKey)
      : null;
    if (!fields) return "this arrow";
    return `${fields.letter} · turns ${fields.turnsTuple} · ${fields.oriFolder} · ${fields.motionType} · ${fields.propType}`;
  });

  /**
   * Remove the Special tier for this key app-wide.
   *
   * The static special-placement JSON ships in a file and cannot be deleted at
   * runtime, so removal is a tombstone doc at the same key. Local-first so the
   * arrow drops to Default immediately, then persisted.
   */
  async function handleSuppressSpecial() {
    const repo = getSpecialOverrideRepository();
    const fields = specialOverrideKey
      ? parseSpecialOverrideKey(specialOverrideKey)
      : null;
    if (!repo || !fields) return;
    // Retain whatever the tier is currently serving, so Restore and the audit
    // trail can name the value that was hidden.
    const hidden = diagnostics?.specialJson?.firestoreOverride?.original ??
      diagnostics?.specialJson?.value ?? { x: 0, y: 0 };
    const input = {
      ...fields,
      originalX: hidden.x,
      originalY: hidden.y,
    };
    try {
      saveState = "saving";
      repo.saveSuppressionLocal(input);
      pictographPreparer.clearCache();
      globalAdjustmentVersion.increment();
      await repo.saveSuppression(input);
      hasLocalChanges = false;
      pendingSuppress = false;
      saveState = "idle";
      getHapticFeedback()?.trigger("warning");
      onDiagnosticsChanged?.();
    } catch (error) {
      logger.error("Special suppression failed:", error);
      saveState = "idle";
    }
  }

  /** Lift the tombstone — deleting the doc lets the shipped static value win again. */
  async function handleRestoreSpecial() {
    const repo = getSpecialOverrideRepository();
    if (!repo || !specialOverrideKey) return;
    try {
      saveState = "saving";
      repo.deleteOverrideLocal(specialOverrideKey);
      await repo.deleteOverride(specialOverrideKey);
      pictographPreparer.clearCache();
      globalAdjustmentVersion.increment();
      saveState = "idle";
      getHapticFeedback()?.trigger("success");
      onDiagnosticsChanged?.();
    } catch (error) {
      logger.error("Special restore failed:", error);
      saveState = "idle";
    }
  }

  function handleKeydown(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    )
      return false;
    if (!activeHand) return false;
    const key = event.key.toLowerCase();

    // Z (no modifier): revert the current tier's override for the selected arrow
    // back to its baseline (clears the Special override → arrow returns to default
    // placement and the tier shows "none"). Mirrors the Revert button.
    if (key === "z" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      handleDelete();
      return true;
    }

    if (!["w", "a", "s", "d"].includes(key)) return false;

    event.preventDefault();
    event.stopPropagation();

    let increment = 5;
    if (event.shiftKey && event.ctrlKey) increment = 200;
    else if (event.shiftKey) increment = 20;

    handleWASDMovement(key as "w" | "a" | "s" | "d", increment);
    return true;
  }

  // Ctrl/Cmd+S anywhere (while the dock is active), or Enter inside the X/Y
  // inputs, commits the save. Returns true when it handled the event.
  function handleSaveHotkey(event: KeyboardEvent): boolean {
    const isSaveCombo =
      event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey);
    const target = event.target as HTMLElement;
    const isEnterInInput = event.key === "Enter" && target?.tagName === "INPUT";
    if (!isSaveCombo && !isEnterInInput) return false;
    event.preventDefault();
    if (hasLocalChanges) handleSave();
    return true;
  }

  async function handleWASDMovement(
    key: "w" | "a" | "s" | "d",
    increment: number
  ) {
    const directionMap: Record<string, { dx: number; dy: number }> = {
      w: { dx: 0, dy: -increment },
      s: { dx: 0, dy: increment },
      a: { dx: -increment, dy: 0 },
      d: { dx: increment, dy: 0 },
    };
    const dir = directionMap[key]!;
    const motion = stepData.motions?.[activeHand!];
    const pd = selectedArrowContext?.pictographData;
    if (motion && arrowLocation && pd) {
      const placementFrame = createCanonicalPlacementContext(
        pd,
        motion,
        arrowLocation
      );
      const canonicalScreenDelta = rotateScreenVectorToCanonical(
        { x: dir.dx, y: dir.dy },
        placementFrame.rotationDegrees
      );
      // WASD is a SCREEN-space direction; tier values are REFERENCE-space.
      // Undo the box-frame rotation, then invert the canonical diamond tuple so
      // the pressed key moves the visible arrow in the requested direction.
      const refDelta = screenSpaceAdjustmentTransformer.transformToReference(
        new Point(canonicalScreenDelta.x, canonicalScreenDelta.y),
        placementFrame.motionData,
        placementFrame.location ?? arrowLocation
      );
      editX += refDelta.x;
      editY += refDelta.y;
      // TEMP DIAGNOSTIC — set window.__DBG_ARROW = true, then press a direction.
      // Pairs with [XFORM] (transform internals) + [TUPLE] (render). Shows the
      // screen delta we asked for vs the reference delta stored. Remove once fixed.
      if (
        typeof globalThis !== "undefined" &&
        (globalThis as { __DBG_ARROW?: boolean }).__DBG_ARROW
      ) {
        console.log(
          `[WASD] key=${key} screenDelta=(${dir.dx},${dir.dy}) ${activeHand}` +
            ` mt=${String(motion.motionType).toLowerCase()} rot=${String(motion.rotationDirection).toLowerCase()}` +
            ` prop=${motion.propType?.toLowerCase() ?? "staff"} arrowLoc=${arrowLocation}` +
            ` → refDelta=(${refDelta.x},${refDelta.y}) editXY=(${editX},${editY})`
        );
      }
    } else {
      editX += dir.dx;
      editY += dir.dy;
    }

    if (editTarget === "special-json") {
      handleSpecialJsonNumericUpdate();
    } else {
      handleDefaultNumericUpdate();
    }

    const haptic = getHapticFeedback();
    haptic?.trigger("selection");
  }

  // One-shot finish: persist any pending edit (current tier), then hand control
  // back to the host so it can leave + re-render. Save is async so the override
  // is committed before the host re-bakes off it.
  async function handleDoneClick() {
    if (hasLocalChanges) await handleSave();
    onDone?.();
  }

  async function handleSave() {
    if (editTarget === "special-json") {
      return handleSpecialJsonSave();
    }
    return handleDefaultSave();
  }

  async function handleDelete() {
    // Z / Revert means "drop this tier's override and fall back to the layer
    // below" — Special → Default, Default → JSON baseline. It NEVER means
    // "zero the value": the JSON baseline holds hand-authored non-zero defaults.
    // If there is no override at the current tier, the arrow is already at its
    // baseline, so this is a no-op (no pointless Firestore write, no error).
    if (editTarget === "special-json") {
      // An override is removable here if it's persisted in Firestore, present
      // in the repo's local state, OR an unsaved live nudge (hasLocalChanges).
      // A fresh nudge has only the last two — keying off firestoreOverride alone
      // made Z a no-op right after editing, which is exactly when you press it.
      const repo = getSpecialOverrideRepository();
      const repoHas =
        !!repo?.isInitialized && !!specialOverrideKey
          ? repo.hasOverride(specialOverrideKey)
          : false;
      const hasSpecial =
        !!diagnostics?.specialJson?.firestoreOverride ||
        repoHas ||
        hasLocalChanges;
      // TEMP DIAGNOSTIC — set window.__DBG_ARROW = true, press Z. Shows the three
      // signals the guard ORs together + repo init (the card-context concern).
      // Remove once Z-delete is confirmed.
      if (
        typeof globalThis !== "undefined" &&
        (globalThis as { __DBG_ARROW?: boolean }).__DBG_ARROW
      ) {
        console.log(
          `[Z-DELETE] tier=special key=${specialOverrideKey ?? "null"}` +
            ` repoInit=${!!repo?.isInitialized} repoHas=${repoHas}` +
            ` firestoreOverride=${!!diagnostics?.specialJson?.firestoreOverride}` +
            ` hasLocalChanges=${hasLocalChanges} → willDelete=${hasSpecial}`
        );
      }
      if (!hasSpecial) {
        getHapticFeedback()?.trigger("selection");
        return;
      }
      return handleSpecialJsonDelete();
    }
    if (!defaultHasValue) {
      getHapticFeedback()?.trigger("selection");
      return;
    }
    return handleDefaultDelete();
  }

  function handleNumericChange() {
    if (editTarget === "special-json") {
      handleSpecialJsonNumericUpdate();
    } else {
      handleDefaultNumericUpdate();
    }
  }

  function handleSpecialJsonNumericUpdate() {
    const repo = getSpecialOverrideRepository();
    if (!repo || !specialOverrideKey) return;
    const originalValue =
      diagnostics?.specialJson?.firestoreOverride?.original ??
      (diagnostics?.specialJson ? diagnostics.specialJson.value : null);
    const input = buildSpecialJsonInput(editX, editY, originalValue);
    if (!input) return;
    repo.saveOverrideLocal(input);
    pictographPreparer.clearCache();
    globalAdjustmentVersion.increment();
    hasLocalChanges = true;
  }

  function buildSpecialJsonInput(
    x: number,
    y: number,
    original: { x: number; y: number } | null
  ): SpecialArrowPlacementInput | null {
    const c = activeHand ?? HandSide.LEFT;
    const motion = stepData.motions?.[c];
    if (!motion || !stepData.letter) return null;

    // Derive the 7 key fields by parsing THE canonical key, so the write
    // input's identity equals the key the renderer reads (incl. propType).
    const pd: PictographData = selectedArrowContext?.pictographData ?? {
      id: stepData.id,
      letter: stepData.letter,
      startPlacement: stepData.startPlacement,
      endPlacement: stepData.endPlacement,
      motions: stepData.motions as PictographData["motions"],
    };
    const fields = parseSpecialOverrideKey(
      computeSpecialOverrideKey(pd, motion, c)
    );
    if (!fields) return null;

    return {
      placementFrame: fields.placementFrame,
      oriFolder: fields.oriFolder,
      letter: fields.letter,
      turnsTuple: fields.turnsTuple,
      motionType: fields.motionType,
      attributeKey: fields.attributeKey,
      propType: fields.propType,
      adjustmentX: x,
      adjustmentY: y,
      originalX: original?.x ?? 0,
      originalY: original?.y ?? 0,
    };
  }

  async function handleSpecialJsonSave() {
    const repo = getSpecialOverrideRepository();
    if (!repo || !specialOverrideKey) return;
    const originalValue =
      diagnostics?.specialJson?.firestoreOverride?.original ??
      (diagnostics?.specialJson && !diagnostics.specialJson.firestoreOverride
        ? diagnostics.specialJson.value
        : null);
    const input = buildSpecialJsonInput(editX, editY, originalValue);
    if (!input) return;
    try {
      saveState = "saving";
      await repo.saveOverride(input);
      saveState = "saved";
      hasLocalChanges = false;
      const haptic = getHapticFeedback();
      haptic?.trigger("success");
      onDiagnosticsChanged?.();
      setTimeout(() => {
        saveState = "idle";
      }, 2000);
    } catch (error) {
      logger.error("Special JSON save failed:", error);
      saveState = "idle";
    }
  }

  async function handleSpecialJsonDelete() {
    const repo = getSpecialOverrideRepository();
    if (!repo || !specialOverrideKey) return;
    try {
      repo.deleteOverrideLocal(specialOverrideKey);
      await repo.deleteOverride(specialOverrideKey);
      pictographPreparer.clearCache();
      globalAdjustmentVersion.increment();
      hasLocalChanges = false;
      const haptic = getHapticFeedback();
      haptic?.trigger("warning");
      onDiagnosticsChanged?.();
    } catch (error) {
      logger.error("Special JSON delete failed:", error);
    }
  }

  function handleDefaultNumericUpdate() {
    const repo = getDefaultOverrideRepository();
    const lk = defaultLookup;
    if (!repo || !lk) return;
    repo.saveDefaultLocal(
      lk.placementFrame,
      lk.propType,
      lk.motionType,
      lk.placementKey,
      lk.turns,
      [editX, editY]
    );
    pictographPreparer.clearCache();
    globalAdjustmentVersion.increment();
    hasLocalChanges = true;
  }

  async function handleDefaultSave() {
    const repo = getDefaultOverrideRepository();
    const lk = defaultLookup;
    if (!repo || !lk) return;
    try {
      saveState = "saving";
      await repo.saveDefault(
        lk.placementFrame,
        lk.propType,
        lk.motionType,
        lk.placementKey,
        lk.turns,
        [editX, editY]
      );
      saveState = "saved";
      hasLocalChanges = false;
      getHapticFeedback()?.trigger("success");
      onDiagnosticsChanged?.();
      setTimeout(() => {
        saveState = "idle";
      }, 2000);
    } catch (error) {
      logger.error("Default save failed:", error);
      saveState = "idle";
    }
  }

  async function handleDefaultDelete() {
    const repo = getDefaultOverrideRepository();
    const lk = defaultLookup;
    if (!repo || !lk) return;
    try {
      repo.deleteDefaultLocal(
        lk.placementFrame,
        lk.propType,
        lk.motionType,
        lk.placementKey,
        lk.turns
      );
      await repo.deleteDefault(
        lk.placementFrame,
        lk.propType,
        lk.motionType,
        lk.placementKey,
        lk.turns
      );
      pictographPreparer.clearCache();
      globalAdjustmentVersion.increment();
      hasLocalChanges = false;
      getHapticFeedback()?.trigger("warning");
      onDiagnosticsChanged?.();
    } catch (error) {
      logger.error("Default delete failed:", error);
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (!activeHand) return;
    if (handleSaveHotkey(e)) return;
    handleKeydown(e);
  }}
/>

<footer
  data-save-shortcut-scope
  class="editor-dock"
  class:idle={!activeHand}
  style="--c: {colorToken}"
>
  {#if !activeHand}
    <span class="dock-idle"
      ><i class="fas fa-hand-pointer" aria-hidden="true"></i> Select an arrow to adjust
      its position →</span
    >
  {:else}
    <div class="dock-head">
      <span class="dock-dot" style="background: {colorToken}"></span>
      <!-- Ghost-sizer: the title box reserves the width of the longest possible
           variant so flipping color (Red↔Blue) or tier never resizes the head
           and shoves the rest of the dock row. The hidden sizer must hold the
           widest combination of {handName} · {tierLabel}. -->
      <span class="dock-title">
        <span class="dock-title-sizer" aria-hidden="true"
          >Left · bigdoublecontactball · Default</span
        >
        <span class="dock-title-live">{dockTitleText}</span>
      </span>
    </div>

    <div class="dock-tier">
      <SegmentedControl
        options={tierOptions}
        value={editTarget}
        onchange={selectEditTarget}
        color={segColor}
        size="sm"
      />
    </div>

    <div class="dock-vals">
      <label class="dock-input-label"
        >X<input
          type="number"
          class="dock-input"
          bind:value={editX}
          onchange={handleNumericChange}
        /></label
      >
      <label class="dock-input-label"
        >Y<input
          type="number"
          class="dock-input"
          bind:value={editY}
          onchange={handleNumericChange}
        /></label
      >
    </div>

    <!-- One slot, three states. The ghost-sizer holds the widest of them so
         swapping between hint / shadow warning / confirm never resizes the row
         and shoves the actions to its right (no-layout-shift.md). -->
    <div class="dock-status">
      <span class="dock-status-sizer" aria-hidden="true"
        >Shadowed by Prop Geometry — edits here won't move the arrow</span
      >
      <span class="dock-status-live">
        {#if pendingSuppress}
          <span class="dock-confirm">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            Remove for every pictograph matching {suppressScopeText}?
          </span>
        {:else if shadowedBy}
          <span class="dock-shadow">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            Shadowed by {tierLabel(shadowedBy)} — edits here won't move the arrow
          </span>
        {:else}
          <span class="dock-hint"
            ><kbd>W A S D</kbd> move · Shift ×4 · Ctrl+Shift ×40 ·
            <kbd>Ctrl+S</kbd> save · live preview
            {#if hasLocalChanges}<span class="dock-unsaved"
                ><i class="fas fa-circle" aria-hidden="true"></i> Unsaved</span
              >{/if}
          </span>
        {/if}
      </span>
    </div>

    <div class="dock-actions">
      {#if editTarget === "default" && defaultLookup}
        <DefaultArrowAdjustmentHistory
          placementFrame={defaultLookup.placementFrame}
          propType={defaultLookup.propType}
          motionType={defaultLookup.motionType}
          placementKey={defaultLookup.placementKey}
          turns={defaultLookup.turns}
          accentColor={colorToken}
        />
      {/if}
      {#if pendingSuppress}
        <button
          class="btn btn-cancel"
          onclick={() => (pendingSuppress = false)}
        >
          Cancel
        </button>
        <button class="btn btn-danger" onclick={handleSuppressSpecial}>
          {#if saveState === "saving"}<i
              class="fas fa-spinner fa-spin"
              aria-hidden="true"
            ></i>{:else}<i class="fas fa-ban" aria-hidden="true"></i>{/if}
          Remove everywhere
        </button>
      {:else if canRemoveSpecial && specialSuppressed}
        <button
          class="btn btn-restore"
          onclick={handleRestoreSpecial}
          title="Restore the special placement for this key"
        >
          <i class="fas fa-rotate-left" aria-hidden="true"></i> Restore special
        </button>
      {:else if canRemoveSpecial}
        <button
          class="btn btn-danger"
          onclick={() => (pendingSuppress = true)}
          title="Remove the special placement so this arrow places from Default"
        >
          <i class="fas fa-ban" aria-hidden="true"></i> Remove special
        </button>
      {/if}
      {#if editTarget === "special-json" && diagnostics?.specialJson?.firestoreOverride}
        <button
          class="btn btn-delete"
          onclick={handleDelete}
          title="Revert to original"
          ><i class="fas fa-undo" aria-hidden="true"></i> Revert</button
        >
      {:else if editTarget === "default" && defaultHasValue}
        <button
          class="btn btn-delete"
          onclick={handleDelete}
          title="Revert to JSON baseline"
          ><i class="fas fa-undo" aria-hidden="true"></i> Revert</button
        >
      {/if}
      <!-- Mid-confirm the only two answers are Cancel and Remove. Leaving Save
           in place also widened the actions group enough to wrap the dock onto a
           third row, shifting everything. -->
      {#if pendingSuppress}
        <!-- no commit button while confirming -->
      {:else if onDone}
        <button class="btn btn-done" onclick={handleDoneClick}>
          {#if saveState === "saving"}<i
              class="fas fa-spinner fa-spin"
              aria-hidden="true"
            ></i>{:else}<i class="fas fa-check" aria-hidden="true"></i>{/if}
          Done
        </button>
      {:else}
        <button
          data-save-shortcut
          class="btn btn-save"
          onclick={handleSave}
          disabled={!hasLocalChanges}
        >
          {#if saveState === "saving"}<i
              class="fas fa-spinner fa-spin"
              aria-hidden="true"
            ></i>{:else if saveState === "saved"}<i
              class="fas fa-check"
              aria-hidden="true"
            ></i>{:else}<i class="fas fa-save" aria-hidden="true"></i>{/if}
          Save
        </button>
      {/if}
    </div>
  {/if}
</footer>

<style>
  .editor-dock {
    flex: none;
    min-height: 76px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 12px 18px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--c, #58a6ff) 8%,
      var(--theme-panel-bg, rgba(13, 17, 23, 0.98))
    );
  }
  .editor-dock.idle {
    background: var(--theme-panel-bg, rgba(13, 17, 23, 0.98));
  }
  .dock-idle {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }
  .dock-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dock-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex: none;
  }
  /* inline-grid stacks sizer + live text in one cell; cell width = widest of
     the two = the sizer. Live text left-aligns over it. No reflow on switch. */
  .dock-title {
    display: inline-grid;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, #fff);
  }
  .dock-title-sizer,
  .dock-title-live {
    grid-area: 1 / 1;
    white-space: nowrap;
  }
  .dock-title-sizer {
    visibility: hidden;
  }
  .dock-title-live {
    font-variant-numeric: tabular-nums;
  }
  /* Wide enough that the equal-width segments fit their longest label
     ("Special JSON") without clipping. Grows into spare
     dock space, wraps to its own full-width row when the dock is cramped. */
  .dock-tier {
    flex: 1 1 520px;
    /* A flat 460px floor overflowed the dock by 154px inside a 325px-wide panel
       on a phone. The floor is a preference, not a requirement. */
    min-width: min(460px, 100%);
    max-width: 680px;
  }
  .dock-vals {
    display: flex;
    gap: 12px;
  }
  .dock-input-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }
  .dock-input {
    width: 76px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.25);
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
    font-size: 18px;
    font-weight: 700;
    text-align: center;
  }
  .dock-input:focus {
    outline: none;
    border-color: var(--theme-accent, #58a6ff);
  }
  /* Grid-stacks the sizer and the live status in one cell, so the cell is always
     as wide as the longest state and nothing to its right moves on a swap. */
  .dock-status {
    display: inline-grid;
    font-size: var(--font-size-compact, 12px);
    /* Hard cap, because the confirm names a full lookup identity and is longer
       than any sizer worth reserving. Capped + wrapping, the long state grows
       DOWN inside its own slot instead of shoving the actions sideways —
       measured shifting them 122px before this. */
    max-width: min(46ch, 100%);
    /* A flex item's default `min-width: auto` is its min-content width, and the
       sizer is deliberately nowrap — so the reservation became a floor the dock
       couldn't shrink past, overflowing a narrow panel. Zeroing it lets the slot
       shrink and the live text wrap. */
    min-width: 0;
    overflow: hidden;
  }
  .dock-status-sizer,
  .dock-status-live {
    grid-area: 1 / 1;
  }
  .dock-status-sizer {
    visibility: hidden;
    white-space: nowrap;
  }
  .dock-status-live {
    white-space: normal;
  }
  .dock-shadow,
  .dock-confirm {
    align-items: flex-start;
  }
  .dock-shadow i,
  .dock-confirm i {
    margin-top: 2px;
  }
  .dock-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }
  .dock-shadow,
  .dock-confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--semantic-warning, #f59e0b);
  }
  .dock-hint kbd {
    /* The chip is one key name — letting it break mid-chip renders "W A S" over
       "D", which reads as two different shortcuts. */
    white-space: nowrap;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    padding: 3px 9px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }
  .dock-unsaved {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--semantic-warning, #f59e0b);
  }
  .dock-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .btn {
    min-height: var(--min-touch-target, 44px);
    padding: 0 20px;
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: inherit;
  }
  .btn-delete {
    background: transparent;
    color: var(--semantic-error, #f85149);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #f85149) 40%,
      transparent
    );
  }
  .btn-danger {
    background: color-mix(
      in srgb,
      var(--semantic-error, #f85149) 18%,
      transparent
    );
    color: var(--semantic-error, #f85149);
    border-color: var(--semantic-error, #f85149);
  }
  .btn-cancel {
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }
  .btn-restore {
    background: transparent;
    color: var(--semantic-warning, #f59e0b);
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 45%,
      transparent
    );
  }
  .btn-save {
    background: var(--semantic-success, #238636);
    color: #fff;
    border-color: var(--semantic-success, #238636);
  }
  .btn-save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  /* One-shot "Done": prominent — it's the primary action for the Fix Arrows flow. */
  .btn-done {
    background: var(--semantic-success, #238636);
    color: #fff;
    border-color: var(--semantic-success, #238636);
    font-size: 16px;
    font-weight: 700;
    padding: 0 28px;
  }
  @media (prefers-reduced-motion: reduce) {
    .btn {
      transition: none;
    }
  }
</style>
