<script lang="ts">
  import { T } from "@threlte/core";
  import { useGltf, useKtx2, useMeshopt } from "@threlte/extras";
  import { Color, Mesh, MeshStandardMaterial, type Object3D } from "three";
  import coordinateManifest from "../../../../../../../docs/superpowers/specs/seraphic-vault/seraphic-vault-gate2-coordinate-manifest.json";

  interface Props {
    stageZOffset?: number;
    onReady?: () => void;
  }

  type RegisteredViewport = "desktop" | "portrait" | "landscapePhone";

  let { stageZOffset = 0, onReady }: Props = $props();
  let viewportWidth = $state(1920);
  let viewportHeight = $state(1080);
  let reportedReady = false;

  const registeredViewport = $derived<RegisteredViewport>(
    viewportHeight <= 500
      ? "landscapePhone"
      : viewportWidth / Math.max(1, viewportHeight) <= 0.8
        ? "portrait"
        : "desktop"
  );
  const sanctuaries = useGltf(
    "/models/celestial/seraphic-vault-integrated-sanctuaries.glb?v=gate5-20260809",
    {
      meshoptDecoder: useMeshopt(),
      ktx2Loader: useKtx2("/basis/"),
    }
  );

  function getPlatform(platformId: string) {
    return coordinateManifest.platforms.find(
      (platform) => platform.id === platformId
    );
  }

  function applyMaterialGrade(root: Object3D): void {
    if (root.userData.tkaGate5MaterialGradeApplied === true) return;
    const distanceBlue = new Color("#93a9c0");

    root.traverse((child: Object3D) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = true;
      const platform = getPlatform(String(child.userData.tka_platform ?? ""));
      const blueShift = platform?.blueShift ?? 0.5;
      const atmosphericOpacity = platform?.atmosphericOpacity ?? 0.4;
      const role = String(child.userData.tka_role ?? "");
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.metalness = 0;
        material.roughness = Math.max(material.roughness, 0.7);
        material.envMapIntensity = Math.max(0.1, 0.32 - blueShift * 0.16);
        material.color.lerp(distanceBlue, 0.18 + blueShift * 0.34);

        if (role === "distant-sanctuary-cloud-collar") {
          material.transparent = true;
          material.opacity = Math.min(0.72, atmosphericOpacity + 0.18);
          material.depthWrite = false;
          material.emissive.set("#b9d2e9");
          material.emissiveIntensity = 0.08 + blueShift * 0.08;
        } else if (material.name.includes("IridescentInlay")) {
          material.emissive.set("#8fbfd6");
          material.emissiveIntensity = 0.14 + blueShift * 0.08;
        } else {
          material.emissive.set("#596b83");
          material.emissiveIntensity = 0.025 + blueShift * 0.035;
        }
        material.needsUpdate = true;
      }
    });

    root.userData.tkaGate5MaterialGradeApplied = true;
  }

  $effect(() => {
    const root = $sanctuaries?.scene;
    if (!root) return;
    applyMaterialGrade(root);
    if (!reportedReady) {
      reportedReady = true;
      onReady?.();
    }
  });

  $effect(() => {
    const root = $sanctuaries?.scene;
    if (!root) return;
    const viewport = registeredViewport;
    root.traverse((child: Object3D) => {
      if (child.userData.tka_role !== "responsive-platform-root") return;
      const platform = getPlatform(String(child.userData.tka_platform ?? ""));
      if (!platform) return;
      const position = platform.positions[viewport];
      const [x, y, z] = position;
      if (x === undefined || y === undefined || z === undefined) return;
      child.position.set(x, y, z + stageZOffset);
    });
  });
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

{#if $sanctuaries}
  <T is={$sanctuaries.scene} />
{/if}
