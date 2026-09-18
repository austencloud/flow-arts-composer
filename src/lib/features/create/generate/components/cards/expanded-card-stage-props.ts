/**
 * Prop types for ExpandedCardStage.svelte.
 *
 * Pulled out of the component's <script lang="ts"> because svelte-check
 * rejects `export interface` there; module-level types declared inline are
 * not hoisted the way plain `interface` declarations are.
 */
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import type { GuestLoopLockKind } from "$lib/shared/create/services/loop-guest-gate";
import type { FavoriteState } from "../../state/favorite-state.svelte";
import type { ActiveSetupSource } from "../../domain/models/favorite-config";

export type RhythmValue = {
  rotationInterval: 2 | 4;
  inversionInterval: 2 | 4;
  inversionMode: "expand" | "overlay";
  reflectionAxis: ReflectionAxis;
};

export interface LoopStageProps {
  rhythm?: RhythmValue;
  sequenceLength?: number;
  onRhythmChange?: (updates: Partial<RhythmValue>) => void;
  onLoopDisable?: () => void;
  guestMaxLength?: number;
  onRequestSignup?: (kind: GuestLoopLockKind) => void;
}

export interface SetupsStageProps {
  favoriteState: FavoriteState;
  isSignedOut: boolean;
  isPreview: boolean;
  isAnonymous: boolean;
  onApply: (source: ActiveSetupSource) => void;
  onRequestCommunityAccount: () => void;
  onRequestShareAccount: () => void;
  onRequestSignIn: () => void;
}
