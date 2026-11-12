<script lang="ts">
  /**
   * Stage3D
   *
   * A rustic wooden performance stage centered at world origin. Styled
   * as a low campground/festival platform - individual plank strips
   * sitting on short thick legs, raised above the ground so it reads
   * as a real physical thing rather than a floating panel.
   *
   * Two jobs:
   *   1. Give the performer a clearly-bounded floor so viewers can see
   *      the avatar move relative to a fixed reference (foot offset
   *      sliders in collision lab, or sequence choreography in the
   *      main viewer).
   *   2. Make "downstage" visually obvious - a warm glowing footlight
   *      strip along the +Z edge (toward the audience), plus color-coded
   *      side cues on stage-right (+X, red) and stage-left (-X, green),
   *      so rotation is readable at a glance.
   *
   * Convention (matches Mixamo + collision lab + sequence viewer):
   * character-right = +X, forward = +Z (toward audience), up = +Y.
   *
   * The stage stays at world origin in X and Z - performers walk ON
   * TOP of it via their rig root offset. Only Y tracks the ground level
   * so it sits flush with whatever environment is active.
   */

  import { T } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { STAGE } from "@austencloud/scene-3d";
  import { getStageDirectionCuesShown } from "../context/stage-direction-cues-context";

  interface Props {
    /** Width of the stage along the X axis in meters. Default 6m. */
    width?: number;
    /** Depth of the stage along the Z axis in meters. Default 4.5m. */
    depth?: number;
    /** Height of the deck above the ground in meters. Default from STAGE constant. */
    height?: number;
    /**
     * Override ground Y if the consumer knows its scene places the
     * floor somewhere other than userProportionsState.groundY (e.g.
     * a studio environment at Y=0). Normally omitted.
     */
    overrideGroundY?: number;
    /**
     * The footlight strip, edge bars, downstage triangle and cardinal dots.
     * They answer "which way is the audience" for a practice viewer. On a
     * scene being filmed they read as instrumentation drawn over the set, so
     * a host that owns the deck as scenery turns them off and keeps the
     * planks, which several environments need as their performer surface.
     */
    showDirectionCues?: boolean;
    /** Scene-local material grade without creating a second stage owner. */
    appearance?: "standard" | "autumn";
  }

  let {
    width = 6.0,
    depth = 4.5,
    height = STAGE.STAGE_DECK_HEIGHT,
    overrideGroundY,
    showDirectionCues = true,
    appearance = "standard",
  }: Props = $props();

  // Ground level tracks the visible floor of whatever environment is
  // active. For the default forest floor this is ~-1.5 (below the
  // avatar's shoulder-origin Mixamo rig).
  const groundY = $derived(overrideGroundY ?? userProportionsState.groundY);
  // The host viewer can turn the cues off for a whole scene (a recording).
  const viewerCuesShown = getStageDirectionCuesShown();

  // ─── Stage geometry constants (all in meters) ─────────────────────

  // Alias for readability - matches the prop value
  const DECK_HEIGHT = $derived(height);

  /** Thickness of each plank. */
  const PLANK_THICKNESS = 0.055;

  /** Width of each plank strip (front-to-back face). */
  const PLANK_WIDTH = 0.34;

  /**
   * Small gap between adjacent planks to read as individual boards.
   * Also helps fake the "between-planks shadow" look.
   */
  const PLANK_GAP = 0.012;

  /** Support leg dimensions (thick wooden posts under the corners). */
  const LEG_THICKNESS = 0.14;
  const LEG_INSET = 0.22;

  /** Cross-beam (skirt) that wraps the perimeter just below the deck. */
  const SKIRT_HEIGHT = 0.11;
  const SKIRT_THICKNESS = 0.05;

  /** Edge "footlight" strip dimensions, sitting on top of the deck. */
  const STRIP_HEIGHT = 0.035;
  const STRIP_WIDTH = 0.05;

  const halfW = $derived(width / 2);
  const halfD = $derived(depth / 2);

  /**
   * Deck top Y in the local frame of the stage group (which is
   * positioned at (0, groundY, 0)). Everything else on the deck is
   * measured from this surface.
   */
  const DECK_TOP = $derived(DECK_HEIGHT);

  //
  // Lay planks running along the X axis, stacked in Z. The count is
  // chosen so each plank is PLANK_WIDTH wide with PLANK_GAP between
  // them, covering the full stage depth. Leftover space is absorbed
  // by small outer margins.
  //
  // Each plank gets a slightly different brown shade so the deck reads
  // as real wood rather than a flat sheet. The shade table is short
  // and deterministic (cycled by index), so the look is reproducible.

  const PLANK_COLORS = [
    "#6a4a2b",
    "#5a3f24",
    "#755132",
    "#4f3720",
    "#664329",
    "#7a5737",
  ];

  const plankColors = $derived(
    appearance === "autumn"
      ? ["#40291d", "#4b3021", "#38241a", "#543524", "#432a1c", "#4a2d20"]
      : PLANK_COLORS
  );

  const cuePalette = $derived(
    appearance === "autumn"
      ? {
          downstage: "#c88950",
          upstage: "#4f4968",
          right: "#8f5258",
          left: "#637b67",
          intensity: 0.32,
          toneMapped: true,
        }
      : {
          downstage: "#ffb347",
          upstage: "#3d5a80",
          right: "#f87171",
          left: "#4ade80",
          intensity: 1,
          toneMapped: false,
        }
  );

  interface Plank {
    z: number;
    color: string;
  }

  const planks = $derived.by<Plank[]>(() => {
    const stride = PLANK_WIDTH + PLANK_GAP;
    const count = Math.max(1, Math.round(depth / stride));
    const totalSpan = count * PLANK_WIDTH + (count - 1) * PLANK_GAP;
    const start = -totalSpan / 2 + PLANK_WIDTH / 2;
    const result: Plank[] = [];
    for (let i = 0; i < count; i++) {
      result.push({
        z: start + i * stride,
        color: plankColors[i % plankColors.length]!,
      });
    }
    return result;
  });

  // Corner leg positions (inset from the edge so they read as supports
  // peeking out under the deck rather than flush with the sides).
  const legPositions = $derived<Array<[number, number]>>([
    [halfW - LEG_INSET, halfD - LEG_INSET],
    [-(halfW - LEG_INSET), halfD - LEG_INSET],
    [halfW - LEG_INSET, -(halfD - LEG_INSET)],
    [-(halfW - LEG_INSET), -(halfD - LEG_INSET)],
  ]);

  const legCenterY = $derived(
    DECK_TOP - PLANK_THICKNESS - DECK_HEIGHT / 2 + 0.02
  );

  // Skirt beams wrap around the perimeter just below the deck top.
  const skirtCenterY = $derived(DECK_TOP - PLANK_THICKNESS - SKIRT_HEIGHT / 2);
  const skirtInset = LEG_THICKNESS * 0.3;

  //
  // Wooden posts with glowing flames at the two front corners of the
  // stage. They sit ON the deck (base at DECK_TOP) and rise upward.

  const TORCH_HEIGHT = 1.4;
  const TORCH_POST_RADIUS = 0.04;

  // Positions are in local stage-group space (Y=0 is ground level).
  // Posts sit at the outer corners of the deck.
  const torchPositions = $derived([
    { x: halfW, z: halfD }, // stage-right downstage corner
    { x: -halfW, z: halfD }, // stage-left downstage corner
  ]);

  // ─── Upstage stairs (-Z edge) ──────────────────────────────────────
  //
  // Three steps descending from the deck top to the ground. Each step
  // is narrower (in Z depth) than the deck planks and uses the same
  // wood color palette so they read as part of the same structure.

  const STAIR_WIDTH = 0.8; // X extent - centered on stage
  const STAIR_DEPTH = 0.22; // Z extent per tread
  const STEP_COUNT = 3;
  const stepHeight = $derived(DECK_TOP / STEP_COUNT); // Even divisions to reach ground

  interface StairStep {
    y: number; // center Y of this step box
    z: number; // center Z position
    height: number;
    color: string;
  }

  const stairSteps = $derived.by<StairStep[]>(() => {
    const steps: StairStep[] = [];
    for (let i = 0; i < STEP_COUNT; i++) {
      // Step 0 is the highest (closest to deck), step N-1 is the lowest
      const topOfStep = DECK_TOP - i * stepHeight;
      steps.push({
        y: topOfStep - stepHeight / 2,
        z: -(halfD + STAIR_DEPTH * (i + 0.5)),
        height: stepHeight,
        color: plankColors[(i + 2) % plankColors.length]!,
      });
    }
    return steps;
  });
</script>

<T.Group position={[0, groundY, 0]}>
  <!--
    Support legs. Thick wooden posts at each corner, inset from the
    edge of the deck. Visible as short stubs peeking out beneath the
    skirt - they sell the "real raised platform" feel.
  -->
  {#each legPositions as [x, z]}
    <T.Mesh position={[x, legCenterY, z]} castShadow>
      <T.BoxGeometry args={[LEG_THICKNESS, DECK_HEIGHT, LEG_THICKNESS]} />
      <T.MeshStandardMaterial
        color="#3d2a18"
        roughness={0.92}
        metalness={0.02}
      />
    </T.Mesh>
  {/each}

  <!--
    Perimeter skirt beams: a low cross-beam around the stage below
    the deck top, bridging the corner legs. Four box meshes forming
    a frame. Matches the legs in color so it reads as one support
    structure.
  -->
  <!-- Front and back beams (run along X) -->
  <T.Mesh position={[0, skirtCenterY, halfD - skirtInset]}>
    <T.BoxGeometry
      args={[width - skirtInset * 2, SKIRT_HEIGHT, SKIRT_THICKNESS]}
    />
    <T.MeshStandardMaterial color="#3d2a18" roughness={0.9} />
  </T.Mesh>
  <T.Mesh position={[0, skirtCenterY, -(halfD - skirtInset)]}>
    <T.BoxGeometry
      args={[width - skirtInset * 2, SKIRT_HEIGHT, SKIRT_THICKNESS]}
    />
    <T.MeshStandardMaterial color="#3d2a18" roughness={0.9} />
  </T.Mesh>
  <!-- Side beams (run along Z) -->
  <T.Mesh position={[halfW - skirtInset, skirtCenterY, 0]}>
    <T.BoxGeometry
      args={[SKIRT_THICKNESS, SKIRT_HEIGHT, depth - skirtInset * 2]}
    />
    <T.MeshStandardMaterial color="#3d2a18" roughness={0.9} />
  </T.Mesh>
  <T.Mesh position={[-(halfW - skirtInset), skirtCenterY, 0]}>
    <T.BoxGeometry
      args={[SKIRT_THICKNESS, SKIRT_HEIGHT, depth - skirtInset * 2]}
    />
    <T.MeshStandardMaterial color="#3d2a18" roughness={0.9} />
  </T.Mesh>

  <!--
    The deck itself: a row of individual plank meshes running along
    the X axis, stacked in Z. Small gaps between planks read as
    floorboard seams. Each plank gets a slightly different brown
    tone so the surface feels like real wood.
  -->
  {#each planks as plank (plank.z)}
    <T.Mesh
      position={[0, DECK_TOP - PLANK_THICKNESS / 2, plank.z]}
      receiveShadow
      castShadow
    >
      <T.BoxGeometry args={[width, PLANK_THICKNESS, PLANK_WIDTH]} />
      <T.MeshStandardMaterial
        color={plank.color}
        roughness={0.88}
        metalness={0.03}
      />
    </T.Mesh>
  {/each}

  {#if showDirectionCues && viewerCuesShown()}
    <!--
      Downstage (+Z) footlight strip: warm bright yellow, emissive so it
      glows like a real stage footlight. Strongest visual cue for the
      audience direction.
    -->
    <T.Mesh position={[0, DECK_TOP + STRIP_HEIGHT / 2, halfD - 0.01]}>
      <T.BoxGeometry args={[width * 0.94, STRIP_HEIGHT, STRIP_WIDTH]} />
      <T.MeshStandardMaterial
        color={cuePalette.downstage}
        emissive={cuePalette.downstage}
        emissiveIntensity={1.4 * cuePalette.intensity}
        toneMapped={cuePalette.toneMapped}
      />
    </T.Mesh>

    <!--
      Upstage (-Z) back marker: dim cool blue so "behind" is distinct
      from "front" even from an overhead view. Much dimmer than the
      footlights so the audience direction still dominates.
    -->
    <T.Mesh position={[0, DECK_TOP + STRIP_HEIGHT / 2, -(halfD - 0.01)]}>
      <T.BoxGeometry args={[width * 0.94, STRIP_HEIGHT, STRIP_WIDTH]} />
      <T.MeshStandardMaterial
        color={cuePalette.upstage}
        emissive={cuePalette.upstage}
        emissiveIntensity={0.45 * cuePalette.intensity}
        toneMapped={cuePalette.toneMapped}
      />
    </T.Mesh>

    <!--
      Stage-right (+X = character-right = red port light) and stage-left
      (-X = character-left = green starboard light). Theater convention
      measured from the performer's POV when facing the audience.
    -->
    <T.Mesh position={[halfW - 0.01, DECK_TOP + STRIP_HEIGHT / 2, 0]}>
      <T.BoxGeometry args={[STRIP_WIDTH, STRIP_HEIGHT, depth * 0.94]} />
      <T.MeshStandardMaterial
        color={cuePalette.right}
        emissive={cuePalette.right}
        emissiveIntensity={0.75 * cuePalette.intensity}
        toneMapped={cuePalette.toneMapped}
      />
    </T.Mesh>
    <T.Mesh position={[-(halfW - 0.01), DECK_TOP + STRIP_HEIGHT / 2, 0]}>
      <T.BoxGeometry args={[STRIP_WIDTH, STRIP_HEIGHT, depth * 0.94]} />
      <T.MeshStandardMaterial
        color={cuePalette.left}
        emissive={cuePalette.left}
        emissiveIntensity={0.75 * cuePalette.intensity}
        toneMapped={cuePalette.toneMapped}
      />
    </T.Mesh>

    {#if appearance === "standard"}
      <!--
      Big orange triangle on the downstage half of the floor, pointing
      at the audience. CircleGeometry with segments=3 gives an
      equilateral triangle; thetaStart=-π/2 places the first vertex at
      local -Y so after lay-flat (rotation.x = -π/2) the apex points
      at world +Z (downstage).
    -->
      <T.Mesh
        position={[0, DECK_TOP + 0.003, halfD * 0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <T.CircleGeometry args={[0.55, 3, -Math.PI / 2]} />
        <T.MeshStandardMaterial
          color={cuePalette.downstage}
          emissive={cuePalette.downstage}
          emissiveIntensity={cuePalette.intensity}
          toneMapped={cuePalette.toneMapped}
        />
      </T.Mesh>

      <!--
      Small cardinal dots at the other three edges, tinted to match the
      corresponding edge strip so direction is legible at a glance.
    -->
      {@const dotInset = 0.38}
      {@const dotY = DECK_TOP + 0.003}
      <T.Mesh
        position={[0, dotY, -(halfD - dotInset)]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <T.CircleGeometry args={[0.14, 24]} />
        <T.MeshStandardMaterial
          color={cuePalette.upstage}
          emissive={cuePalette.upstage}
          emissiveIntensity={0.6 * cuePalette.intensity}
          toneMapped={cuePalette.toneMapped}
        />
      </T.Mesh>
      <T.Mesh
        position={[halfW - dotInset, dotY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <T.CircleGeometry args={[0.14, 24]} />
        <T.MeshStandardMaterial
          color={cuePalette.right}
          emissive={cuePalette.right}
          emissiveIntensity={0.8 * cuePalette.intensity}
          toneMapped={cuePalette.toneMapped}
        />
      </T.Mesh>
      <T.Mesh
        position={[-(halfW - dotInset), dotY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <T.CircleGeometry args={[0.14, 24]} />
        <T.MeshStandardMaterial
          color={cuePalette.left}
          emissive={cuePalette.left}
          emissiveIntensity={0.8 * cuePalette.intensity}
          toneMapped={cuePalette.toneMapped}
        />
      </T.Mesh>
    {/if}
  {/if}

  <!--
    Downstage corner torches: wooden posts with glowing flames rising
    from the front corners of the deck.
  -->
  {#each torchPositions as torch}
    <!-- Wooden post - base sits on deck top -->
    <T.Mesh position={[torch.x, DECK_TOP + TORCH_HEIGHT / 2, torch.z]}>
      <T.CylinderGeometry
        args={[TORCH_POST_RADIUS, TORCH_POST_RADIUS * 1.3, TORCH_HEIGHT, 8]}
      />
      <T.MeshStandardMaterial color="#3d2a18" roughness={0.9} />
    </T.Mesh>
    <!-- Flame holder (wider cap at top of post) -->
    <T.Mesh position={[torch.x, DECK_TOP + TORCH_HEIGHT - 0.05, torch.z]}>
      <T.CylinderGeometry args={[0.08, 0.06, 0.1, 8]} />
      <T.MeshStandardMaterial
        color="#2a1a0c"
        roughness={0.85}
        metalness={0.15}
      />
    </T.Mesh>
    <!-- Glowing flame -->
    <T.Mesh position={[torch.x, DECK_TOP + TORCH_HEIGHT + 0.08, torch.z]}>
      <T.SphereGeometry args={[0.1, 8, 6]} />
      <T.MeshStandardMaterial
        color="#ff8822"
        emissive="#ff6600"
        emissiveIntensity={2.5}
        toneMapped={false}
      />
    </T.Mesh>
    <!-- Torch point light -->
    <T.PointLight
      position={[torch.x, DECK_TOP + TORCH_HEIGHT + 0.15, torch.z]}
      color="#ff7722"
      intensity={15}
      distance={8}
      decay={1.5}
    />
  {/each}

  <!--
    Upstage stairs: three steps descending from deck to ground at the
    back (-Z) edge. Lets the performer "walk up" onto the stage from
    the forest floor. Same wood tones as the deck planks.
  -->
  {#each stairSteps as step}
    <T.Mesh position={[0, step.y, step.z]} castShadow receiveShadow>
      <T.BoxGeometry args={[STAIR_WIDTH, step.height, STAIR_DEPTH]} />
      <T.MeshStandardMaterial
        color={step.color}
        roughness={0.88}
        metalness={0.03}
      />
    </T.Mesh>
  {/each}
</T.Group>
