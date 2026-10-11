<!--
  One performer pedestal: body, lip, and the generated figure lit on the top
  face.

  The face is sunk behind the lip on purpose. A visitor standing on the floor
  reads a pedestal top at a shallow angle, and a flat plate at that angle
  catches the room's glare instead of the drawing. Sunk into a shadowed well and
  lit from inside it, the figure reads from the walking line.

  `animated` is the open experiment (spec E1): a light runs the circuit of the
  figure so the base appears to be performing the same drawing as the props
  above it. Recommended ON at the wing opener, where no performer competes with
  it, and OFF under the three cases until we have looked at both.

  Spec: docs/superpowers/specs/2026-08-16-museum-pedestal-and-console-design.md
-->
<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import {
    AdditiveBlending,
    CanvasTexture,
    DoubleSide,
    SRGBColorSpace,
    Texture,
    TextureLoader,
  } from "three";
  import {
    PEDESTAL_EDGE,
    PEDESTAL_FACE_INSET,
  } from "#lib/features/museum/domain/pedestal-standard.js";

  interface Props {
    /** Centre of the pedestal in scene space, at its BASE. */
    position: [number, number, number];
    height: number;
    diameter: number;
    /** Generated face as a data URI. Null renders a blank pedestal. */
    faceUri: string | null;
    /** Wing colour. Tints the body and the face's own light. */
    tint: string;
    /** Body material colour. */
    bodyColor?: string;
    /** Run a light around the figure (spec E1). */
    animated?: boolean;
  }

  const {
    position,
    height,
    diameter,
    faceUri,
    tint,
    bodyColor = "#2b3a41",
    animated = false,
  }: Props = $props();

  const radius = $derived(diameter / 2);
  const faceRadius = $derived(radius - PEDESTAL_EDGE);

  /**
   * Local Y of the rim's top surface, measured from the group's centre. The
   * group is centred on the pedestal's full height, so this is its true top.
   */
  const rimY = $derived(height / 2);
  /** Local Y of the recessed well floor, one inset below the rim. */
  const faceY = $derived(rimY - PEDESTAL_FACE_INSET);
  /**
   * Height of the solid body beneath the well floor, held a hair short of it.
   * Coplanar with the floor disc, the two 48-segment triangle fans z-fight into
   * a radial star — which on this object of all objects reads as a drawing.
   */
  const bodyH = $derived(height - PEDESTAL_FACE_INSET - 0.01);
  const bodyY = $derived(faceY - 0.01 - bodyH / 2);

  let faceTexture = $state<Texture | null>(null);

  $effect(() => {
    if (!faceUri) {
      faceTexture = null;
      return;
    }
    let cancelled = false;
    const loader = new TextureLoader();
    loader.load(faceUri, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      faceTexture = texture;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const texture = faceTexture;
    return () => texture?.dispose();
  });

  // ── The travelling light (E1) ─────────────────────────────────────────────
  /**
   * A one-armed conic sweep. Multiplied over the figure by additive blending,
   * it brightens only the arc it is currently passing over, so the drawing
   * appears to be drawn rather than merely lit.
   */
  function buildSweepTexture(): CanvasTexture | null {
    if (typeof document === "undefined") return null;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const centre = size / 2;
    const gradient = ctx.createConicGradient(0, centre, centre);
    // A short bright head with a long decaying tail, so the sweep reads as a
    // direction of travel rather than as a spinning bar.
    gradient.addColorStop(0.0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.06, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.12)");
    gradient.addColorStop(0.62, "rgba(255,255,255,0)");
    gradient.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  const sweepTexture = $derived(animated ? buildSweepTexture() : null);

  $effect(() => {
    const texture = sweepTexture;
    return () => texture?.dispose();
  });

  let sweepAngle = $state(0);
  /** One full circuit every four seconds — a walking pace, not a strobe. */
  const SWEEP_PERIOD_S = 4;

  useTask((delta) => {
    if (!animated) return;
    sweepAngle = (sweepAngle + (delta * Math.PI * 2) / SWEEP_PERIOD_S) % (Math.PI * 2);
  });
</script>

<T.Group position={[position[0], position[1] + height / 2, position[2]]}>
  <!-- Body. Its top cap IS the well floor, so it stops an inset short of the
       rim rather than closing over the drawing. -->
  <T.Mesh position={[0, bodyY, 0]} castShadow receiveShadow>
    <T.CylinderGeometry args={[radius, radius, bodyH, 48]} />
    <T.MeshStandardMaterial
      color={bodyColor}
      roughness={0.68}
      metalness={0.06}
    />
  </T.Mesh>

  <!-- Rim wall: the inset rise from the well floor to the true top. -->
  <T.Mesh position={[0, rimY - PEDESTAL_FACE_INSET / 2, 0]} castShadow>
    <T.CylinderGeometry
      args={[radius, radius, PEDESTAL_FACE_INSET, 48, 1, true]}
    />
    <T.MeshStandardMaterial
      color={bodyColor}
      roughness={0.5}
      metalness={0.12}
      side={DoubleSide}
    />
  </T.Mesh>

  <!-- Rim top: the annulus the visitor's eye lands on, and the edge that reads
       the object at a distance. -->
  <T.Mesh position={[0, rimY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <T.RingGeometry args={[faceRadius, radius, 48]} />
    <T.MeshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.12} />
  </T.Mesh>

  <!-- The well floor, UNLIT.

       This is the one surface in the object that refuses the room. Each Water
       alcove hangs a warm lamp 1.4 m directly above its pedestal, and a lit
       floor — even at a near-black albedo — resolves to mid-tan under that much
       irradiance, which washes the figure off it. Unlit, the well is the same
       dark box under a cave lamp, a forge, or daylight, so the readout reads
       identically in all six wings. The body and rim below still take the
       wing's light: the pedestal belongs to the era, the readout belongs to
       the museum. -->
  <T.Mesh position={[0, faceY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <T.CircleGeometry args={[faceRadius, 48]} />
    <T.MeshBasicMaterial color="#05080a" />
  </T.Mesh>

  {#if faceTexture}
    <!-- The generated figure. Unlit, so it carries its own light in a dark
         room rather than depending on where the wing's lamps happen to be. -->
    <T.Mesh position={[0, faceY + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <T.CircleGeometry args={[faceRadius, 48]} />
      <T.MeshBasicMaterial
        map={faceTexture}
        color={tint}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </T.Mesh>

    {#if sweepTexture}
      <!-- The travelling light. Masked by the figure itself, so it can only
           brighten where there is something to draw. -->
      <T.Mesh
        position={[0, faceY + 0.004, 0]}
        rotation={[-Math.PI / 2, 0, sweepAngle]}
      >
        <T.CircleGeometry args={[faceRadius, 48]} />
        <T.MeshBasicMaterial
          map={sweepTexture}
          alphaMap={faceTexture}
          color={tint}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </T.Mesh>
    {/if}
  {/if}
</T.Group>
