<!--
  DefaultArrowAdjustmentHistory.svelte

  Default-placement history for the currently-selected arrow. Thin wrapper over
  the shared AdjustmentHistoryPanel: loads the last 15 history rows for this
  arrow's entryKey and reverts via the default-override repo. Admin-only (mounts
  inside the Default tier of PipelineEditorDock).
-->
<script lang="ts">
  import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
  import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
  } from "firebase/firestore";
  import { generateDefaultDocId } from "#lib/shared/pictograph/arrow/positioning/default-override/domain/default-arrow-placement.js";
  import { getDefaultOverrideRepository } from "#lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton.js";
  import { globalAdjustmentVersion } from "#lib/shared/pictograph/arrow/positioning/global/state/global-adjustment-version.svelte.js";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
  import AdjustmentHistoryPanel, {
    type HistoryEntry,
  } from "../AdjustmentHistoryPanel.svelte";

  interface Props {
    placementFrame: string;
    propType: string;
    motionType: string;
    placementKey: string;
    turns: string;
    accentColor?: string;
  }
  let {
    placementFrame,
    propType,
    motionType,
    placementKey,
    turns,
    accentColor,
  }: Props = $props();

  const entryKey = $derived(
    `${generateDefaultDocId(placementFrame, propType, motionType)}|${placementKey}|${turns}`
  );

  // Snapshot the key the loader closes over so revert targets the right arrow.
  let active = $state({
    placementFrame,
    propType,
    motionType,
    placementKey,
    turns,
  });
  $effect(() => {
    active = { placementFrame, propType, motionType, placementKey, turns };
  });

  async function load(): Promise<HistoryEntry[]> {
    const firestore = await getFirestoreInstance();
    const q = query(
      collection(firestore, "default_arrow_adjustment_history"),
      where("entryKey", "==", entryKey),
      orderBy("timestamp", "desc"),
      limit(15)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        action: data.action ?? "save",
        x: data.newX ?? null,
        y: data.newY ?? null,
        prevX: data.prevX ?? null,
        prevY: data.prevY ?? null,
        timestamp: data.timestamp?.toDate?.() ?? null,
        updatedBy: data.updatedBy ?? "unknown",
        label: `${data.placementKey ?? placementKey} · ${data.turns ?? turns}t`,
      } satisfies HistoryEntry;
    });
  }

  // Revert reproduces the state the entry produced: a save re-saves its value, a
  // delete re-deletes. Each goes through the normal write path, appending a fresh
  // history row (append-only — history is never mutated).
  async function onRevert(entry: HistoryEntry): Promise<void> {
    const repo = getDefaultOverrideRepository();
    if (!repo) return;
    const {
      placementFrame: frame,
      propType: p,
      motionType: m,
      placementKey: k,
      turns: t,
    } = active;

    if (entry.action === "delete") {
      repo.deleteDefaultLocal(frame, p, m, k, t);
      pictographPreparer.clearCache();
      globalAdjustmentVersion.increment();
      await repo.deleteDefault(frame, p, m, k, t);
      return;
    }

    const value: [number, number] = [entry.x ?? 0, entry.y ?? 0];
    repo.saveDefaultLocal(frame, p, m, k, t, value);
    pictographPreparer.clearCache();
    globalAdjustmentVersion.increment();
    await repo.saveDefault(frame, p, m, k, t, value);
  }
</script>

<AdjustmentHistoryPanel
  {load}
  {onRevert}
  reloadKey={entryKey}
  variant="popover"
  {accentColor}
/>
