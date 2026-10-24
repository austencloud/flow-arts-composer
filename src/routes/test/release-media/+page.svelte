<!--
  Release example bake: the 2D half.

  Bakes the landing demo sequence once per effect with the real export
  engine and saves each take as `<effect>-2d` through /api/dev/release-media.
  The 3D halves come from /test/viewer-3d?take=<effect>-3d&effect=<effect>,
  and `scripts/release-media-grid.mjs` composes the two into the grid clip.
  `?effects=silk,goo` picks the set; `?autorun=1` starts on load.
  `?presets=ink-toxic,ink-neon-tag` bakes the effect once per preset instead,
  saved as `<effect>-2d-<preset>`, to compare looks before picking one.
  `?scenes=zans-hand,zans-poi` bakes release scenes instead (release-scenes.ts),
  each saved under its own take name.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { renderLoopClip } from "#lib/shared/sequence-clips/render-loop-clip.js";
  import { EFFECTS } from "#lib/shared/effects/domain/effect-meta.js";
  import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import { INK_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/ink-presets.js";
  import { SILK_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/silk-presets.js";
  import { GOO_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/goo-presets.js";
  import { RELEASE_SCENES, type ReleaseScene } from "./release-scenes";
  import { SMOKE_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/smoke-presets.js";

  // `?seq=<id>` bakes a public sequence instead of the landing demo.
  const sequenceId = page.url.searchParams.get("seq");
  async function loadSequence(): Promise<SequenceData> {
    if (!sequenceId) return demoSequenceJson as unknown as SequenceData;
    const loaded = await getBrowseLoader().loadFullSequenceData(
      sequenceId,
      sequenceId
    );
    if (!loaded)
      throw new Error(`${sequenceId} is not public or failed to load`);
    return loaded;
  }
  const requested = (
    page.url.searchParams.get("effects") ?? "silk,goo,ink,smoke"
  )
    .split(",")
    .filter((id) => EFFECTS.some((effect) => effect.id === id)) as EffectType[];

  const PRESETS = [
    ...INK_PRESETS,
    ...SILK_PRESETS,
    ...GOO_PRESETS,
    ...SMOKE_PRESETS,
  ] as { id: string; patch: Record<string, unknown> }[];
  const presetIds = page.url.searchParams.get("presets")?.split(",") ?? [];

  const sceneIds = page.url.searchParams.get("scenes")?.split(",") ?? [];
  const scenes = RELEASE_SCENES.filter((scene) =>
    sceneIds.includes(scene.take)
  );

  let rows = $state(
    scenes.length
      ? scenes.map((scene) => ({
          effect: null as EffectType | null,
          scene: scene as ReleaseScene | null,
          take: scene.take,
          patch: undefined as Record<string, unknown> | undefined,
          status: "queued",
          url: null as string | null,
        }))
      : requested.flatMap((effect) => {
          const presets = PRESETS.filter(
            (preset) =>
              presetIds.includes(preset.id) &&
              preset.id.startsWith(`${effect}-`)
          );
          return (presets.length ? presets : [null]).map((preset) => ({
            effect: effect as EffectType | null,
            scene: null as ReleaseScene | null,
            take: preset
              ? `${effect}-2d-${preset.id.slice(effect.length + 1)}`
              : `${effect}-2d`,
            patch: preset?.patch,
            status: "queued",
            url: null as string | null,
          }));
        })
  );
  let running = $state(false);

  async function bake() {
    running = true;
    const shared = scenes.length ? null : await loadSequence();
    for (const row of rows) {
      try {
        row.status = "rendering";
        const sequence = row.scene ? await row.scene.sequence() : shared!;
        const options = row.scene
          ? await row.scene.options(sequence)
          : { effect: row.effect ?? undefined, effectPatch: row.patch };
        const { blob } = await renderLoopClip(sequence, {
          ...options,
          onProgress: (p) =>
            (row.status = `${p.stage} ${Math.round(p.progress * 100)}%`),
        });
        row.url = URL.createObjectURL(blob);
        const response = await fetch(
          `/api/dev/release-media?name=${row.take}`,
          {
            method: "POST",
            body: blob,
          }
        );
        row.status = response.ok
          ? `saved ${((await response.json()) as { path: string }).path}`
          : `save failed ${response.status}`;
      } catch (cause) {
        row.status = `failed: ${cause instanceof Error ? cause.message : cause}`;
      }
    }
    running = false;
  }

  onMount(() => {
    if (page.url.searchParams.get("autorun") === "1") void bake();
  });
</script>

<main>
  <button onclick={bake} disabled={running} data-bake>Bake 2D takes</button>
  <ul>
    {#each rows as row (row.take)}
      <li data-take={row.take}>
        <strong>{row.take}</strong> <output>{row.status}</output>
        {#if row.url}
          <video
            src={row.url}
            muted
            loop
            autoplay
            playsinline
            width="240"
            height="240"
          ></video>
        {/if}
      </li>
    {/each}
  </ul>
</main>

<style>
  main {
    padding: 1rem;
    color: white;
    background: #0a0a14;
    min-height: 100vh;
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
    padding: 0;
    list-style: none;
  }
  video {
    display: block;
    margin-top: 0.5rem;
  }
</style>
