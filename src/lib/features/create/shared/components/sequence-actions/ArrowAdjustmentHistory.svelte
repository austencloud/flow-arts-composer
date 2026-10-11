<!--
  ArrowAdjustmentHistory.svelte

  Global arrow-adjustment history. Thin wrapper over the shared
  AdjustmentHistoryPanel: provides the global-collection loader and the
  global-repo revert. Admin-only. Behavior matches the previous self-contained
  version (unfiltered last-15 by timestamp, revert re-saves the entry's value).
-->
<script lang="ts">
  import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
  import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
  } from "firebase/firestore";
  import { getGlobalAdjustmentRepository } from "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js";
  import { globalAdjustmentVersion } from "#lib/shared/pictograph/arrow/positioning/global/state/global-adjustment-version.svelte.js";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
  import AdjustmentHistoryPanel, {
    type HistoryEntry,
  } from "./AdjustmentHistoryPanel.svelte";

  // Carry the global sourceKey on each entry so revert can parse it back.
  const sourceKeyById = new Map<string, string>();

  async function load(): Promise<HistoryEntry[]> {
    const firestore = await getFirestoreInstance();
    const q = query(
      collection(firestore, "global_arrow_adjustment_history"),
      orderBy("timestamp", "desc"),
      limit(15)
    );
    const snap = await getDocs(q);
    sourceKeyById.clear();
    return snap.docs.map((d) => {
      const data = d.data();
      const sourceKey: string = data.sourceKey ?? "";
      sourceKeyById.set(d.id, sourceKey);
      return {
        id: d.id,
        action: data.action ?? "save",
        x: data.adjustmentX ?? 0,
        y: data.adjustmentY ?? 0,
        prevX: data.previousX ?? null,
        prevY: data.previousY ?? null,
        timestamp: data.timestamp?.toDate?.() ?? null,
        updatedBy: data.updatedBy ?? "unknown",
        label: formatSourceKey(sourceKey),
      } satisfies HistoryEntry;
    });
  }

  function formatSourceKey(key: string): string {
    const parts = key.split("|");
    if (parts.length >= 5) return `${parts[2]}·${parts[4]}`;
    return key.slice(0, 20);
  }

  async function onRevert(entry: HistoryEntry): Promise<void> {
    const repo = getGlobalAdjustmentRepository();
    const sourceKey = sourceKeyById.get(entry.id);
    if (!repo || !sourceKey) return;
    const parts = sourceKey.split("|");
    if (parts.length < 5) return;

    const targetKey = {
      placementFrame: parts[0]! as "canonical" | "skewed",
      oriKey: parts[1]!,
      letter: parts[2]!,
      turnsTuple: parts[3]!,
      arrowKey: parts[4]!,
      ...(parts[5] ? { propType: parts[5] } : {}),
      ...(parts[6] ? { otherPropType: parts[6] } : {}),
    };
    const payload = {
      ...targetKey,
      adjustmentX: entry.x ?? 0,
      adjustmentY: entry.y ?? 0,
    };

    repo.saveAdjustmentLocal(payload);
    pictographPreparer.clearCache();
    globalAdjustmentVersion.increment();
    await repo.saveAdjustment(payload);
  }
</script>

<AdjustmentHistoryPanel {load} {onRevert} />
