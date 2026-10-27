import { canonicalJSON } from "#lib/shared/foundation/utils/canonical-json.js";
import type { TunnelComposition } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { TunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import type { TunnelCreatorDraft } from "./tunnel-creator-draft";
import type { TunnelCreatorHandoff } from "../services/tunnel-creator-handoff";

export interface TunnelEditorSessionStatus {
  editingTunnelId: string | null;
  editingTunnelName: string | null;
  hasContent: boolean;
  dirty: boolean;
}

/**
 * Exact editor-content identity for workspace replacement decisions.
 * `updatedAt` is generated whenever the creator captures a draft, so it cannot
 * participate; every performed-result input and provenance field remains.
 */
export function tunnelEditorContentKey(
  composition: TunnelComposition | null,
  presentation: TunnelSnapshot | null
): string | null {
  if (!composition || !presentation) return null;
  const { updatedAt: _updatedAt, ...stableComposition } = composition;
  // Tunnels saved before 2026-10-27 may carry a retired prop version. It
  // draws nothing, so opening such a tunnel does not mark it as edited.
  const { propLook: _retired, ...props } =
    presentation.props as TunnelSnapshot["props"] & { propLook?: unknown };
  return canonicalJSON({
    composition: stableComposition,
    presentation: { ...presentation, props },
  });
}

/**
 * A direct collection open has a trustworthy saved baseline. A restored local
 * draft does not: it may contain work that has never reached the artifact, so
 * any non-empty restored/new workspace is protected before replacement.
 */
export function tunnelEditorSessionStatus(
  draft: TunnelCreatorDraft,
  opened: TunnelCreatorHandoff | null,
  savedBaselineKey: string | null | undefined = undefined
): TunnelEditorSessionStatus {
  const currentKey = tunnelEditorContentKey(
    draft.composition,
    draft.presentation
  );
  const baselineKey =
    savedBaselineKey !== undefined
      ? savedBaselineKey
      : opened
        ? tunnelEditorContentKey(opened.composition, opened.snapshot)
        : null;
  const editingTunnelId = draft.editingTunnel?.id ?? opened?.tunnelId ?? null;
  const editingTunnelName =
    draft.editingTunnel?.name ?? opened?.tunnelName ?? null;
  const hasContent = draft.composition !== null;

  return {
    editingTunnelId,
    editingTunnelName,
    hasContent,
    dirty: baselineKey !== null ? currentKey !== baselineKey : hasContent,
  };
}
