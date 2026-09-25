<!--
  Flat sprite capture for the 2D animator "3D model" prop look.

  One prop, one motion color, rendered through the real Prop3D dispatcher with
  an orthographic camera looking straight at the flat face of the prop. The 3D
  grip (the prop group origin) lands on the box center, because the 2D canvas
  places every sprite's box center on the hand point and rotates about it.
  That is the legacy pictograph convention: the artwork is authored with a
  copy on each side of the hand (one drawn invisible) so the grip is the box
  center and the prop's reach is automatically right. The frame is therefore
  symmetric about the origin and uniformly scaled to fit the existing
  pictograph box, so tip points, trails, and mandala reach stay put.
-->
<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import {
    Box3,
    Group,
    Mesh,
    OrthographicCamera,
    Vector3,
    Quaternion,
  } from "three";
  import type { WebGLRenderer } from "three";
  import {
    Plane,
    Prop3D,
    propFinishState,
    type PropBuild,
    type PropType as ScenePropType,
  } from "@austencloud/scene-3d";
  import { getRoomEnvironmentTexture } from "$lib/shared/3d/rendering/room-environment";
  import {
    paintedBounds,
    type PaintedBounds,
  } from "$lib/shared/pictograph/prop/domain/painted-bounds";

  export interface SpriteCaptureResult {
    dataUrl: string;
    fit: number;
    extent: { x: number; y: number; z: number };
    gripOffset: { x: number; y: number };
    /** Where the prop actually paints inside the grip-centred box. */
    bounds: PaintedBounds | null;
  }

  interface Props {
    propType: ScenePropType;
    color: "blue" | "red";
    /** Pictograph box in 2D prop units. */
    box: { width: number; height: number };
    /** Canvas pixels per 2D prop unit. */
    pixelsPerUnit: number;
    /** Build fields to apply over the scene default (the side-grip capture). */
    build?: Partial<PropBuild>;
    oncaptured: (result: SpriteCaptureResult) => void;
    onempty: () => void;
  }

  let {
    propType,
    color,
    box,
    pixelsPerUnit,
    build: buildOverride,
    oncaptured,
    onempty,
  }: Props = $props();

  const FRAMES_STABLE = 24;
  const FRAMES_GIVE_UP = 600;

  const { scene, renderer } = useThrelte();
  scene.background = null;
  const gl = renderer as WebGLRenderer;
  gl.setClearColor(0x000000, 0);
  scene.environment = getRoomEnvironmentTexture(gl);
  scene.environmentIntensity = 0.9;

  const propState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
    plane: Plane.WALL,
    worldPosition: new Vector3(0, 0, 0),
    worldRotation: new Quaternion(),
  };

  let propGroup = $state<Group | undefined>(undefined);
  let camera = $state<OrthographicCamera | undefined>(undefined);
  const propBuild = $derived({
    ...propFinishState.build,
    ...(buildOverride ?? {}),
  });

  const bounds = new Box3();
  const vertexScratch = new Vector3();
  const probe = document.createElement("canvas");
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  /**
   * Box3.setFromObject counts hidden placeholders; only visible meshes matter.
   * Transforming the mesh's local geometry.boundingBox by matrixWorld (rather
   * than measuring transformed vertices) overstates a rotated partial torus:
   * the bowed arcs of the triangle's frame get an axis-aligned local box far
   * larger than the arc itself, and rotating that oversized box world-space
   * makes the capture frame the prop too small. Walk each vertex instead so
   * the union is the true world-space extent.
   */
  function visibleBounds(root: Group): Box3 {
    bounds.makeEmpty();
    root.updateWorldMatrix(true, true);
    root.traverseVisible((object) => {
      if (!(object instanceof Mesh) || !object.geometry) return;
      const position = object.geometry.getAttribute("position");
      if (!position) return;
      for (let i = 0; i < position.count; i += 1) {
        vertexScratch.fromBufferAttribute(position, i);
        vertexScratch.applyMatrix4(object.matrixWorld);
        bounds.expandByPoint(vertexScratch);
      }
    });
    return bounds;
  }

  /** Fraction of pixels with any alpha, so a not-yet-textured frame is rejected. */
  function coverage(source: HTMLCanvasElement): number {
    if (!probeCtx) return 1;
    const w = 128;
    const h = Math.max(1, Math.round((source.height / source.width) * w));
    probe.width = w;
    probe.height = h;
    probeCtx.clearRect(0, 0, w, h);
    probeCtx.drawImage(source, 0, 0, w, h);
    const data = probeCtx.getImageData(0, 0, w, h).data;
    let hit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 8) hit += 1;
    return hit / (w * h);
  }

  let lastSizeKey = "";
  let stableFrames = 0;
  let totalFrames = 0;
  let done = false;

  useTask(() => {
    if (done || !propGroup || !camera) return;
    totalFrames += 1;
    visibleBounds(propGroup);
    if (bounds.isEmpty()) {
      if (totalFrames > FRAMES_GIVE_UP) {
        done = true;
        onempty();
      }
      return;
    }
    // Legacy pictograph convention: the grip (model origin) is the box center
    // and the frame is mirrored about it, so a one-sided prop like a club or
    // a triad's hub-at-the-hand keeps its true reach from the hand point.
    const extentX = Math.max(
      2 * Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      1e-6
    );
    const extentY = Math.max(
      2 * Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
      1e-6
    );
    const centerX = 0;
    const centerY = 0;
    const maxAbsZ = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
    const fit = Math.min(box.width / extentX, box.height / extentY);
    const halfW = box.width / 2 / fit;
    const halfH = box.height / 2 / fit;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.layers.enableAll();
    camera.near = 0.001;
    camera.far = maxAbsZ * 4 + 2;
    camera.position.set(centerX, centerY, maxAbsZ * 2 + 1);
    camera.lookAt(centerX, centerY, 0);
    camera.updateProjectionMatrix();

    const sizeKey = [
      extentX.toFixed(4),
      extentY.toFixed(4),
      centerX.toFixed(4),
      centerY.toFixed(4),
    ].join(":");
    if (sizeKey === lastSizeKey) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      lastSizeKey = sizeKey;
    }
    if (stableFrames < FRAMES_STABLE) return;

    const widthPx = Math.round(box.width * pixelsPerUnit);
    const heightPx = Math.round(box.height * pixelsPerUnit);
    gl.setSize(widthPx, heightPx, false);
    gl.setPixelRatio(1);
    gl.render(scene, camera);
    if (coverage(gl.domElement) < 0.002) {
      // Geometry is placed but nothing painted yet (materials/textures still
      // streaming). Keep rendering until pixels land or we give up.
      if (totalFrames > FRAMES_GIVE_UP) {
        done = true;
        onempty();
      }
      return;
    }
    done = true;
    oncaptured({
      dataUrl: gl.domElement.toDataURL("image/webp", 0.92),
      fit,
      extent: { x: extentX, y: extentY, z: maxAbsZ * 2 },
      // Where the 3D grip (model origin) lands, in 2D box units from the box
      // center, y down like the canvas.
      gripOffset: { x: -centerX * fit, y: centerY * fit },
      bounds: paintedBounds(gl.domElement, widthPx, heightPx, pixelsPerUnit),
    });
  });
</script>

<T.OrthographicCamera bind:ref={camera} makeDefault position={[0, 0, 3]} />

<T.AmbientLight intensity={0.55} color="#ffffff" />
<T.DirectionalLight position={[1.5, 2.5, 4]} intensity={1.4} color="#ffffff" />
<T.DirectionalLight position={[-3, 1, 2]} intensity={0.5} color="#dfe6ff" />
<T.DirectionalLight position={[0, -2, 3]} intensity={0.35} color="#ffffff" />

<T.Group bind:ref={propGroup}>
  <!-- Not the active player: keeps the prop on LAYER_WORLD, which the camera sees. -->
  <Prop3D {propType} {propState} {color} build={propBuild} />
</T.Group>
