<script module lang="ts">
  import { BoxGeometry, CanvasTexture, MeshStandardMaterial, PlaneGeometry } from "three";

  const SCREEN_W = 0.9;
  const SCREEN_H = 0.6;
  const screenGeo = new PlaneGeometry(SCREEN_W, SCREEN_H);
  const bezelGeo = new BoxGeometry(SCREEN_W + 0.08, SCREEN_H + 0.08, 0.06);
  const bezelMat = new MeshStandardMaterial({ color: "#1a1f1c", metalness: 0.35, roughness: 0.5 });
  const cardGeo = new PlaneGeometry(0.3, 0.4);
  const cardBackGeo = new BoxGeometry(0.32, 0.42, 0.02);
  const cardBackMat = new MeshStandardMaterial({ color: "#3b3b3b", roughness: 0.7 });
  const standGeo = new BoxGeometry(0.05, 1.2, 0.05);
  const standMat = new MeshStandardMaterial({ color: "#2a2a2a", metalness: 0.5, roughness: 0.5 });

  const MONO = "Consolas, 'Courier New', monospace";
  const SANS = "Arial, Helvetica, sans-serif";

  /** The case card: what the Order wrote beside the case. Cached per card text. */
  const cardCache = new Map<string, OffscreenCanvas>();
  function cardCanvas(lines: string[], key: string): OffscreenCanvas {
    const cached = cardCache.get(key);
    if (cached) return cached;
    const w = 192;
    const h = 256;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e9e5da";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(0, 0, w, 30);
    ctx.fillStyle = "#e9e5da";
    ctx.font = `bold 10px ${SANS}`;
    ctx.fillText("BUREAU OF KINETIC CONTAINMENT", 8, 19);
    ctx.fillStyle = "#1c1c1c";
    let y = 54;
    lines.forEach((line, i) => {
      ctx.font = `${i === 0 ? "bold 15px" : "12px"} ${SANS}`;
      const words = line.split(" ");
      let row = "";
      for (const word of words) {
        const test = row ? `${row} ${word}` : word;
        if (ctx.measureText(test).width > w - 20 && row) {
          ctx.fillText(row, 10, y);
          y += 17;
          row = word;
        } else row = test;
      }
      ctx.fillText(row, 10, y);
      y += i === 0 ? 24 : 20;
    });
    // Review stamp
    ctx.save();
    ctx.translate(w - 58, h - 34);
    ctx.rotate(-0.15);
    ctx.strokeStyle = "rgba(160,40,40,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-44, -11, 88, 22);
    ctx.fillStyle = "rgba(160,40,40,0.6)";
    ctx.font = `bold 9px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("NO ACTION", 0, 3);
    ctx.restore();
    cardCache.set(key, canvas);
    return canvas;
  }

  /** The screen face before the pictograph lands. */
  function screenCanvas(label: string): OffscreenCanvas {
    const w = 384;
    const h = 256;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#07100c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = "#7dff9a";
    ctx.font = `bold 14px ${MONO}`;
    ctx.fillText(label, 14, 26);
    ctx.fillStyle = "#4fd37a";
    ctx.font = `11px ${MONO}`;
    ctx.fillText("LOADING RECORD…", 14, h - 16);
    return canvas;
  }
</script>

<script lang="ts">
  /**
   * The case triptych behind a cave performer: a screen showing the record's
   * first pictograph with the Order's clinical label, and the card sign the
   * Order wrote beside it. The performer is the third panel.
   */
  import { T } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { MUSEUM_EXHIBIT_SEQUENCES } from "../../data/museum-exhibit-sequences";
  import type { CaveCaseCard } from "../../data/museum-narration";

  interface Props {
    performerId: string;
    /** Performer world position and facing yaw; the screen goes behind it. */
    worldX: number;
    worldZ: number;
    worldY?: number;
    yaw: number;
    card: CaveCaseCard;
    active?: boolean;
  }

  const props: Props = $props();
  const worldY = props.worldY ?? 0;
  const yaw = props.yaw;

  // Behind the performer is the opposite of its facing direction.
  const BEHIND = 1.1;
  const SIDE = 0.75;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const screenX = props.worldX - fx * BEHIND;
  const screenZ = props.worldZ - fz * BEHIND;
  // The card stands to the performer's right, a little forward of the screen.
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const cardX = props.worldX - fx * (BEHIND - 0.2) + rx * SIDE;
  const cardZ = props.worldZ - fz * (BEHIND - 0.2) + rz * SIDE;

  const label = `${props.card.category} · CASE ${props.card.caseNumber}/${props.card.caseCount}`;
  const clinical = props.card.technicalMode.toUpperCase();

  const screenSurface = screenCanvas(label);
  const screenTex = new CanvasTexture(screenSurface as unknown as HTMLCanvasElement);
  screenTex.needsUpdate = true;
  const screenMat = new MeshStandardMaterial({
    map: screenTex,
    emissive: "#3dff7a",
    emissiveIntensity: 0.4,
    emissiveMap: screenTex,
    roughness: 0.35,
  });

  const cardTex = new CanvasTexture(
    cardCanvas(
      [
        `CASE ${props.card.caseNumber} OF ${props.card.caseCount}`,
        props.card.category,
        clinical,
        "Record on screen. Do not attempt.",
      ],
      `${props.card.roomId}-${props.card.caseNumber}`
    ) as unknown as HTMLCanvasElement
  );
  cardTex.needsUpdate = true;
  const cardMat = new MeshStandardMaterial({
    map: cardTex,
    emissive: "#8a857a",
    emissiveIntensity: 0.22,
    emissiveMap: cardTex,
    roughness: 0.85,
  });

  let disposed = false;

  // Draw the record's first pictograph onto the screen once the renderer is up.
  async function paintRecord(): Promise<void> {
    const seq = MUSEUM_EXHIBIT_SEQUENCES[props.card.sequenceId];
    const step = seq?.steps[0];
    if (!step) return;
    try {
      await canvas2DDirectRenderer.initialize();
      const pictograph = await canvas2DDirectRenderer.renderPictograph(step as StepData, {
        size: 200,
        visibility: {
          showTKA: true,
          showTnD: false,
          showElemental: false,
          showPlacements: false,
          showReversals: false,
          showNonRadialPoints: false,
          darkMode: false,
        },
      });
      if (disposed) return;
      const canvas = screenSurface;
      const ctx = canvas.getContext("2d")!;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#07100c";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(pictograph as unknown as CanvasImageSource, 12, 36, 200, 200);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = "#7dff9a";
      ctx.font = `bold 14px ${MONO}`;
      ctx.fillText(label, 14, 24);
      ctx.fillStyle = "#9cf5b0";
      ctx.font = `12px ${MONO}`;
      const words = clinical.split(" ");
      let y = 70;
      let row = "";
      for (const word of words) {
        const test = row ? `${row} ${word}` : word;
        if (ctx.measureText(test).width > 140 && row) {
          ctx.fillText(row, 226, y);
          y += 16;
          row = word;
        } else row = test;
      }
      ctx.fillText(row, 226, y);
      ctx.fillStyle = "#4fd37a";
      ctx.font = `11px ${MONO}`;
      ctx.fillText(`REC ${seq?.word ?? ""}`, 226, h - 40);
      ctx.fillText("FRAME 01", 226, h - 22);
      screenTex.needsUpdate = true;
    } catch (err) {
      console.warn("[MuseumCaseScreen3D] pictograph render failed", err);
    }
  }
  void paintRecord();

  onDestroy(() => {
    disposed = true;
    screenMat.dispose();
    screenTex.dispose();
    cardMat.dispose();
    cardTex.dispose();
  });
</script>

<!-- Screen on a stand behind the performer, facing the same way it faces. -->
<T.Group name={`case-screen-${props.performerId}`} position={[screenX, worldY, screenZ]} rotation.y={yaw}>
  <T.Mesh geometry={standGeo} material={standMat} position.y={0.6} />
  <T.Mesh geometry={bezelGeo} material={bezelMat} position={[0, 1.5, -0.03]} />
  <T.Mesh geometry={screenGeo} material={screenMat} position={[0, 1.5, 0.005]} />
</T.Group>

<!-- The card sign beside the case. -->
<T.Group name={`case-card-${props.performerId}`} position={[cardX, worldY, cardZ]} rotation.y={yaw}>
  <T.Mesh geometry={standGeo} material={standMat} position.y={0.55} scale={[0.6, 0.9, 0.6]} />
  <T.Mesh geometry={cardBackGeo} material={cardBackMat} position={[0, 1.15, -0.015]} />
  <T.Mesh geometry={cardGeo} material={cardMat} position={[0, 1.15, 0.001]} />
</T.Group>
