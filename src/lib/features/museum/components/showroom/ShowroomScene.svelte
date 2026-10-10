<script module lang="ts">
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import {
    BoxGeometry,
    MeshStandardMaterial,
    TextureLoader,
  } from "three";

  const MODEL_BASE = "/assets/museum/models/furniture";
  const MODELS = [
    "bench", "benchCushion", "benchCushionLow", "chair", "chairCushion",
    "chairModernCushion", "chairRounded", "loungeChair", "loungeDesignChair",
    "loungeSofa", "loungeSofaCorner", "table", "tableCoffee", "tableCoffeeGlass",
    "tableRound", "tableCross", "desk", "deskCorner", "sideTable",
    "bookcaseOpen", "bookcaseOpenLow", "bookcaseClosed", "bookcaseClosedWide",
    "bookcaseClosedDoors", "books", "coatRack", "coatRackStanding",
    "pottedPlant", "plantSmall1", "plantSmall2", "plantSmall3",
    "lampRoundFloor", "lampRoundTable", "lampSquareFloor", "lampSquareCeiling", "lampWall",
    "rugRectangle", "rugRound", "rugSquare", "rugDoormat",
    "bathroomMirror", "speaker", "speakerSmall", "radio",
    "televisionVintage", "televisionModern", "televisionAntenna",
    "computerScreen", "laptop", "computerKeyboard",
    "doorway", "doorwayOpen", "stairs", "stairsOpen",
    "wall", "wallCorner", "wallDoorway", "wallWindow",
    "paneling", "floorFull", "floorHalf",
    "trashcan", "cardboardBoxClosed", "cardboardBoxOpen",
    "bear", "pillow", "pillowLong",
    "stoolBar", "stoolBarSquare",
    "ceilingFan", "shower", "toilet",
  ];

  // Grid layout: models in rows
  const COLS = 8;
  const SPACING = 3.5; // meters between pedestals
  const PEDESTAL_HEIGHT = 0.4;
  const MODEL_SCALE = 2.0; // Scale up Kenney models for visibility

  const loader = new GLTFLoader();
  const texLoader = new TextureLoader();

  // ── Shared pedestal geometry and material - created once, reused across all mounts ──
  const pedestalGeo = new BoxGeometry(1.2, PEDESTAL_HEIGHT, 1.2);
  const pedestalMat = new MeshStandardMaterial({ color: "#3a3028", roughness: 0.85 });

  export { MODEL_BASE, MODELS, COLS, SPACING, PEDESTAL_HEIGHT, MODEL_SCALE, loader, texLoader, pedestalGeo, pedestalMat };
</script>

<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import {
    RepeatWrapping,
    type Group,
  } from "three";
  import { UnifiedCameraController, CameraMode } from "@austencloud/camera-3d";
  import type { AvatarState } from "@austencloud/camera-3d";
  import { cameraPreferences } from "#lib/shared/3d/camera/camera-preferences.svelte.js";
  import MuseumMirror from "../game/MuseumMirror.svelte";

  interface LoadedItem {
    name: string;
    model: Group;
    col: number;
    row: number;
  }

  let loadedItems: LoadedItem[] = $state([]);

  async function loadAllModels() {
    const items: LoadedItem[] = [];
    for (let i = 0; i < MODELS.length; i++) {
      const name = MODELS[i]!;
      try {
        const gltf = await loader.loadAsync(`${MODEL_BASE}/${name}.glb`);
        const model = gltf.scene;
        model.scale.setScalar(MODEL_SCALE);
        items.push({
          name,
          model,
          col: i % COLS,
          row: Math.floor(i / COLS),
        });
      } catch {
        // Skip models that fail to load
      }
    }
    loadedItems = items;
  }

  loadAllModels();

  // ── Camera (FPS via UCC) ──
  cameraPreferences.setModeForDestination("showroom", CameraMode.FIRST_PERSON);

  const avatarState: AvatarState = {
    position: { x: SPACING * (COLS / 2), y: 0, z: -2 },
    facingAngle: 0,
    isMoving: false,
    setMoveInput() {},
    updateMovement() {},
    setFacingAngle() {},
  };

  // Floor dimensions
  const floorWidth = COLS * SPACING + 4;
  const floorDepth = Math.ceil(MODELS.length / COLS) * SPACING + 8;

  // ── Texture gallery (along left wall, X = -4) ──
  const TEX_BASE = "/assets/museum/textures";
  const TEXTURES = [
    { id: "rock035", label: "Cave Stone", folder: "Rock035_1K-JPG" },
    { id: "rock003", label: "Sandstone", folder: "Rock003_1K-JPG" },
    { id: "marble006", label: "Marble", folder: "Marble006_1K-JPG" },
    { id: "woodfloor007", label: "Wood Floor", folder: "WoodFloor007_1K-JPG" },
    { id: "plaster001", label: "Plaster", folder: "Plaster001_1K-JPG" },
  ];

  interface TextureSwatch {
    label: string;
    material: MeshStandardMaterial;
    z: number;
  }

  let textureSwatches: TextureSwatch[] = $state([]);

  function loadTextures() {
    const swatches: TextureSwatch[] = [];
    for (let i = 0; i < TEXTURES.length; i++) {
      const tex = TEXTURES[i]!;
      const basePath = `${TEX_BASE}/${tex.id}`;

      try {
        // Try to load the PBR maps - filenames vary per pack
        const colorMap = texLoader.load(`${basePath}/${tex.folder}_Color.jpg`);
        colorMap.wrapS = colorMap.wrapT = RepeatWrapping;
        colorMap.repeat.set(2, 2);

        const matProps: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
          map: colorMap,
          roughness: 0.8,
        };

        // Try loading normal map (may not exist for all textures)
        try {
          const normalMap = texLoader.load(`${basePath}/${tex.folder}_NormalGL.jpg`);
          normalMap.wrapS = normalMap.wrapT = RepeatWrapping;
          normalMap.repeat.set(2, 2);
          matProps.normalMap = normalMap;
        } catch { /* optional */ }

        // Try loading roughness map
        try {
          const roughMap = texLoader.load(`${basePath}/${tex.folder}_Roughness.jpg`);
          roughMap.wrapS = roughMap.wrapT = RepeatWrapping;
          roughMap.repeat.set(2, 2);
          matProps.roughnessMap = roughMap;
        } catch { /* optional */ }

        swatches.push({
          label: tex.label,
          material: new MeshStandardMaterial(matProps),
          z: i * 3.5 + 2,
        });
      } catch {
        // Skip textures that fail
      }
    }
    textureSwatches = swatches;
  }

  loadTextures();
</script>

<!-- Camera -->
<T.PerspectiveCamera makeDefault fov={65} near={0.1} far={200} />

<UnifiedCameraController
  destinationId="showroom"
  {avatarState}
  {cameraPreferences}
  enabled={true}
  moveSpeed={4}
/>

<!-- Lighting -->
<T.AmbientLight intensity={0.6} color="#c8b890" />
<T.DirectionalLight intensity={0.8} position={[10, 15, 5]} color="#fff0d0" />
<T.HemisphereLight intensity={0.3} color="#fff8e0" groundColor="#1a1510" />

<!-- Floor -->
<T.Mesh
  position.x={floorWidth / 2 - 2}
  position.y={-0.025}
  position.z={floorDepth / 2 - 2}
  receiveShadow
>
  <T.BoxGeometry args={[floorWidth, 0.05, floorDepth]} />
  <T.MeshStandardMaterial color="#3a3530" roughness={0.9} />
</T.Mesh>

<!-- Model pedestals + models -->
{#each loadedItems as item (item.name)}
  {@const x = item.col * SPACING}
  {@const z = item.row * SPACING + 2}

  <!-- Pedestal -->
  <T.Mesh
    position.x={x}
    position.y={PEDESTAL_HEIGHT / 2}
    position.z={z}
  >
    <T is={pedestalGeo} />
    <T is={pedestalMat} />
  </T.Mesh>

  <!-- Model on pedestal -->
  <T.Group
    position.x={x}
    position.y={PEDESTAL_HEIGHT}
    position.z={z}
  >
    <T is={item.model} />
  </T.Group>

  <!-- Name label (floating text via a small plane - we'll use a point light as marker) -->
  <T.PointLight
    position={[x, PEDESTAL_HEIGHT + 2.5, z]}
    intensity={0.5}
    color="#fff8e0"
    distance={3}
  />
{/each}

<!-- ═══ TEXTURE GALLERY (left wall, X = -4) ═══ -->

<!-- Back wall for texture swatches -->
<T.Mesh position.x={-5} position.y={2} position.z={floorDepth / 2 - 2}>
  <T.BoxGeometry args={[0.2, 4.5, floorDepth]} />
  <T.MeshStandardMaterial color="#1a1510" roughness={0.95} />
</T.Mesh>

{#each textureSwatches as swatch (swatch.label)}
  <!-- Wall swatch panel (2m × 2m) -->
  <T.Mesh position.x={-4.8} position.y={2} position.z={swatch.z}>
    <T.BoxGeometry args={[0.05, 2, 2]} />
    <T is={swatch.material} />
  </T.Mesh>

  <!-- Floor sample tile (2m × 2m on the ground) -->
  <T.Mesh position.x={-3} position.y={0.03} position.z={swatch.z} rotation.x={0}>
    <T.BoxGeometry args={[2, 0.05, 2]} />
    <T is={swatch.material.clone()} />
  </T.Mesh>

  <!-- Spotlight on each swatch -->
  <T.SpotLight
    position={[-4, 3.5, swatch.z]}
    intensity={3}
    color="#fff8e0"
    distance={5}
    angle={0.5}
    penumbra={0.5}
  />
{/each}

<!-- Section divider label area - a warm light marks the texture section -->
<T.PointLight position={[-4, 3, 0]} intensity={2} color="#c8b890" distance={8} />

<!-- ═══ MIRROR DEMO (end of texture wall) ═══ -->
<MuseumMirror
  width={2}
  height={3}
  position={[-4.8, 1.8, TEXTURES.length * 3.5 + 4]}
  rotation={[0, Math.PI / 2, 0]}
  textureWidth={512}
  textureHeight={768}
/>
<T.SpotLight
  position={[-3, 3.5, TEXTURES.length * 3.5 + 4]}
  intensity={4}
  color="#fff8e0"
  distance={6}
  angle={0.5}
  penumbra={0.5}
/>
