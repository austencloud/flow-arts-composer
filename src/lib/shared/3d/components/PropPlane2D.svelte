<script lang="ts">
  import { T } from "@threlte/core";
  import { DoubleSide, CanvasTexture, SRGBColorSpace, NearestFilter } from "three";
  import { applyColorToSvg, SELECTIVE_COLOR_PROP_TYPES } from "#lib/shared/utils/svg-color-utils.js";

  interface Props {
    position: [number, number, number];
    rotation: number;
    width: number;
    height: number;
    color: string;
    propType?: string;
    zIndex?: number;
  }

  let {
    position,
    rotation,
    width,
    height,
    color,
    propType = "staff",
    zIndex = 0,
  }: Props = $props();

  const pos = $derived<[number, number, number]>([
    position[0],
    position[1],
    position[2] + zIndex,
  ]);

  let texture: CanvasTexture | null = $state(null);
  let loadedKey = "";

  const svgCache = new Map<string, string>();

  async function fetchSvg(type: string): Promise<string> {
    const path = `/images/props/animated/${type.toLowerCase()}.svg`;
    const cached = svgCache.get(path);
    if (cached) return cached;
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to fetch ${path}`);
    const text = await resp.text();
    svgCache.set(path, text);
    return text;
  }

  async function loadTexture(type: string, col: string): Promise<CanvasTexture> {
    const raw = await fetchSvg(type);
    const isSelective = (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(
      type.toLowerCase()
    );
    const colored = applyColorToSvg(raw, col, { selectiveColorMode: isSelective });

    const viewBoxMatch = colored.match(/viewBox=["']([^"']+)["']/);
    let vbW = 300, vbH = 92;
    if (viewBoxMatch?.[1]) {
      const parts = viewBoxMatch[1].split(/\s+/).map(Number);
      if (parts.length === 4) {
        vbW = parts[2]!;
        vbH = parts[3]!;
      }
    }

    const dpr = Math.min(window.devicePixelRatio, 2);
    const canvasW = Math.round(vbW * dpr);
    const canvasH = Math.round(vbH * dpr);

    const img = new Image();
    const blob = new Blob([colored], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterization failed"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
    URL.revokeObjectURL(url);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  $effect(() => {
    const key = `${propType}:${color}`;
    if (key === loadedKey) return;
    loadedKey = key;

    loadTexture(propType, color).then((tex) => {
      texture?.dispose();
      texture = tex;
    }).catch((err) => {
      console.warn("[PropPlane2D] texture load failed:", err);
    });
  });
</script>

<T.Mesh position={pos} rotation.z={-rotation}>
  <T.PlaneGeometry args={[width, height]} />
  {#if texture}
    <T.MeshBasicMaterial
      map={texture}
      side={DoubleSide}
      transparent
      alphaTest={0.01}
    />
  {:else}
    <T.MeshBasicMaterial {color} side={DoubleSide} transparent opacity={0.9} />
  {/if}
</T.Mesh>
