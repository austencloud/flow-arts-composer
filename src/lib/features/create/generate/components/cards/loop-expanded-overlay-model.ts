import type { LOOPSpecWire, ReflectionAxis } from "@tka/sequence-engine/loop";

import {
  LOOP_COMPONENTS,
  LOOPComponent,
  type LOOPComponentInfo,
} from "$lib/features/create/generate/shared/domain/constants/loop-components";
import { generateExplanationText } from "$lib/features/create/generate/shared/services/loop-explanation-text-generator";
import {
  guestLoopGate,
  type GuestLoopLock,
} from "$lib/shared/create/services/loop-guest-gate";
import {
  gateRhythm,
  type RhythmGate,
} from "$lib/shared/create/services/loop-rhythm-gating";
import {
  buildLoopSpec,
  canExtendCombo,
  effectiveInversionInterval,
  generateLOOPType,
} from "$lib/shared/create/services/loop-type-utils";

export interface LoopRhythmValue {
  rotationInterval: 2 | 4;
  inversionInterval: 2 | 4;
  inversionMode: "expand" | "overlay";
  reflectionAxis: ReflectionAxis;
}

export interface ReflectionAxisDetail {
  axisLabel: string;
  name: string;
  description: string;
  applyLabel: string;
  line: { x1: number; y1: number; x2: number; y2: number };
}

export const REFLECTION_AXIS_DETAILS = {
  "north-south": {
    axisLabel: "N–S",
    name: "Mirrored",
    description: "The vertical line stays fixed. East and west trade places.",
    applyLabel: "Apply Mirrored",
    line: { x1: 24, y1: 5, x2: 24, y2: 43 },
  },
  "east-west": {
    axisLabel: "E–W",
    name: "Flipped",
    description:
      "The horizontal line stays fixed. North and south trade places.",
    applyLabel: "Apply Flipped",
    line: { x1: 5, y1: 24, x2: 43, y2: 24 },
  },
  "northeast-southwest": {
    axisLabel: "NE–SW",
    name: "Diagonal",
    description:
      "NE and SW stay fixed. North trades with east; south trades with west.",
    applyLabel: "Apply NE–SW Reflection",
    line: { x1: 42, y1: 6, x2: 6, y2: 42 },
  },
  "northwest-southeast": {
    axisLabel: "NW–SE",
    name: "Diagonal",
    description:
      "NW and SE stay fixed. North trades with west; south trades with east.",
    applyLabel: "Apply NW–SE Reflection",
    line: { x1: 6, y1: 6, x2: 42, y2: 42 },
  },
} satisfies Record<ReflectionAxis, ReflectionAxisDetail>;

export const REFLECTION_AXIS_OPTIONS = (
  Object.entries(REFLECTION_AXIS_DETAILS) as Array<
    [ReflectionAxis, ReflectionAxisDetail]
  >
).map(([value, detail]) => ({
  value,
  label: `${detail.axisLabel} axis, ${detail.name}`,
  ariaLabel: `${detail.axisLabel} axis, ${detail.name}. ${detail.description}`,
  tone: "accent" as const,
}));

export function normalizeReflectionSelection(
  components: ReadonlySet<LOOPComponent>
): Set<LOOPComponent> {
  const normalized = new Set(components);
  if (normalized.delete(LOOPComponent.FLIPPED)) {
    normalized.add(LOOPComponent.MIRRORED);
  }
  return normalized;
}

export interface LoopOverlayModelInput {
  selectedComponents: Set<LOOPComponent>;
  isMultiSelectMode: boolean;
  rhythm: LoopRhythmValue;
  rhythmControlsAvailable: boolean;
  detailComponent: LOOPComponent | null;
  sequenceLength?: number;
  guestMaxLength?: number;
}

export interface LoopOverlayModel {
  explanationText: string;
  isImplemented: boolean;
  disabledComponents: Set<LOOPComponent> | null;
  selectionCount: number;
  configurableComponents: Set<LOOPComponent>;
  detailInfo: LOOPComponentInfo | null;
  detailView: string;
  specWire: LOOPSpecWire | null;
  rhythmGate: RhythmGate | null;
  guestLock: GuestLoopLock;
  lockedComponents: Set<LOOPComponent> | null;
  wordMathText: string | null;
  inversionCaption: string;
  buttonText: string;
}

function deriveDisabledComponents(
  selectedComponents: Set<LOOPComponent>,
  isMultiSelectMode: boolean
): Set<LOOPComponent> | null {
  if (!isMultiSelectMode) return null;
  const disabled = new Set<LOOPComponent>();
  for (const info of LOOP_COMPONENTS) {
    const component = info.component as LOOPComponent;
    if (selectedComponents.has(component)) continue;
    if (!canExtendCombo(selectedComponents, component)) {
      disabled.add(component);
    }
  }
  return disabled;
}

function deriveConfigurableComponents(
  selectedComponents: Set<LOOPComponent>,
  rhythmControlsAvailable: boolean
): Set<LOOPComponent> {
  const configurable = new Set<LOOPComponent>();
  if (!rhythmControlsAvailable) return configurable;
  for (const component of [
    LOOPComponent.ROTATED,
    LOOPComponent.INVERTED,
    LOOPComponent.MIRRORED,
  ]) {
    if (selectedComponents.has(component)) configurable.add(component);
  }
  return configurable;
}

function deriveLockedComponents(
  rhythm: LoopRhythmValue,
  isMultiSelectMode: boolean,
  guestMaxLength?: number
): Set<LOOPComponent> | null {
  if (guestMaxLength === undefined || isMultiSelectMode) return null;
  const locked = new Set<LOOPComponent>();
  for (const info of LOOP_COMPONENTS) {
    const component = info.component as LOOPComponent;
    const selection = new Set<LOOPComponent>([component]);
    const gate = guestLoopGate(
      generateLOOPType(selection),
      buildLoopSpec(selection, rhythm),
      guestMaxLength
    );
    if (gate.locked) locked.add(component);
  }
  return locked;
}

function describeWordMath(
  selectedComponents: Set<LOOPComponent>,
  rhythm: LoopRhythmValue,
  rhythmGate: RhythmGate | null,
  sequenceLength?: number
): string | null {
  if (!rhythmGate) return null;
  if (!rhythmGate.ok) return rhythmGate.reason;
  const overlaySuffix =
    selectedComponents.has(LOOPComponent.INVERTED) &&
    rhythm.inversionMode === "overlay"
      ? " · inversion on top"
      : "";
  return `${rhythmGate.seedLength} letters × ${rhythmGate.multiplier} = ${sequenceLength} steps${overlaySuffix}`;
}

function describeInversion(rhythm: LoopRhythmValue): string {
  if (rhythm.inversionMode === "overlay") {
    return effectiveInversionInterval(rhythm) === 4
      ? "Same hand positions — props flip spin direction every quarter."
      : "Same hand positions — props flip spin direction for the second half.";
  }
  // Added length always inverts at halfway: inverting twice restores the
  // original motions, so a quarter rhythm would only repeat the loop.
  return "The inverted half is added to the sequence.";
}

function describeApplyAction(
  selectedComponents: Set<LOOPComponent>,
  isImplemented: boolean,
  guestLock: GuestLoopLock,
  reflectionAxis: ReflectionAxis
): string {
  const selectionCount = selectedComponents.size;
  if (selectionCount === 0) return "Select Components";
  if (!isImplemented) return "Combo Not Supported";
  if (guestLock.locked) return "Sign Up to Unlock";
  if (selectionCount === 1 && selectedComponents.has(LOOPComponent.MIRRORED)) {
    return REFLECTION_AXIS_DETAILS[reflectionAxis].applyLabel;
  }
  if (selectionCount === 1) {
    const component = Array.from(selectedComponents)[0] as LOOPComponent;
    const formatted = component.charAt(0) + component.slice(1).toLowerCase();
    return `Apply ${formatted}`;
  }
  return `Apply ${selectionCount}-Component Combo`;
}

export function buildLoopOverlayModel(
  input: LoopOverlayModelInput
): LoopOverlayModel {
  const {
    selectedComponents,
    isMultiSelectMode,
    rhythm,
    rhythmControlsAvailable,
    detailComponent,
    sequenceLength,
    guestMaxLength,
  } = input;
  const generatedType = generateLOOPType(selectedComponents);
  const specWire = buildLoopSpec(selectedComponents, rhythm);
  const rhythmGate =
    sequenceLength === undefined || !specWire
      ? null
      : gateRhythm(selectedComponents, rhythm, sequenceLength);
  const guestLock =
    guestMaxLength === undefined || selectedComponents.size === 0
      ? ({ locked: false } as const)
      : guestLoopGate(generatedType, specWire, guestMaxLength);
  const detailInfo = detailComponent
    ? (LOOP_COMPONENTS.find((info) => info.component === detailComponent) ??
      null)
    : null;
  const configurableComponents = deriveConfigurableComponents(
    selectedComponents,
    rhythmControlsAvailable
  );
  const isImplemented = generatedType !== null;

  return {
    explanationText: generateExplanationText(selectedComponents),
    isImplemented,
    disabledComponents: deriveDisabledComponents(
      selectedComponents,
      isMultiSelectMode
    ),
    selectionCount: selectedComponents.size,
    configurableComponents,
    detailInfo,
    detailView: detailInfo ? `detail-${detailInfo.component}` : "picker",
    specWire,
    rhythmGate,
    guestLock,
    lockedComponents: deriveLockedComponents(
      rhythm,
      isMultiSelectMode,
      guestMaxLength
    ),
    wordMathText: describeWordMath(
      selectedComponents,
      rhythm,
      rhythmGate,
      sequenceLength
    ),
    inversionCaption: describeInversion(rhythm),
    buttonText: describeApplyAction(
      selectedComponents,
      isImplemented,
      guestLock,
      rhythm.reflectionAxis
    ),
  };
}
