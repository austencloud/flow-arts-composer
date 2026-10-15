<script lang="ts">
  /**
   * PlanarReflector — the one owner of real-time planar reflection.
   *
   * Extracted from MuseumMirror, which coupled the technique to a gilded wall
   * frame and so could not be reused for a horizontal water surface. The
   * reflector is added directly to the Threlte scene rather than through
   * T.Primitive: onBeforeRender only fires for objects the renderer owns, and
   * without it the reflection texture never updates and the surface renders
   * black.
   */
  import { useThrelte } from "@threlte/core";
  import { onMount } from "svelte";
  import { Reflector } from "three/examples/jsm/objects/Reflector.js";
  import {
    PlaneGeometry,
    Shape,
    ShapeGeometry,
    type BufferGeometry,
    type Scene,
    type ShaderMaterial,
  } from "three";

  interface Props {
    width?: number;
    height?: number;
    /**
     * Optional local XY shoreline in metres. Supplying it replaces the
     * rectangular plane with the authored water footprint while preserving
     * the same reflection owner.
     */
    outline?: Array<[number, number]>;
    /** Reflection render-target size. Water can afford less than a mirror. */
    textureWidth?: number;
    textureHeight?: number;
    /** Tint multiplied into the reflection. Darker reads as deeper water. */
    color?: number;
    position?: [number, number, number];
    /** Radians. A floor-plane reflector is [-Math.PI / 2, 0, 0]. */
    rotation?: [number, number, number];
    clipBias?: number;
    /** False keeps the surface mounted but skips its full-scene reflection pass. */
    active?: boolean;
    /**
     * Reflector's own extension point: swap how the reflected image resolves
     * onto the plane. Water passes ReflectivePoolShader here rather than forking
     * this component. Reflector still owns color/tDiffuse/textureMatrix, so a
     * custom shader must declare those three uniforms.
     */
    shader?: {
      name?: string;
      uniforms: Record<string, { value: unknown }>;
      vertexShader: string;
      fragmentShader: string;
    };
    /** Initial values for uniforms the custom shader adds. */
    uniforms?: Record<string, unknown>;
    /** Receives the live reflector so a caller can animate its uniforms. */
    onReady?: (reflector: Reflector) => void;
  }

  const props: Props = $props();

  const { scene } = useThrelte();

  const width = props.width ?? 1.5;
  const height = props.height ?? 2.5;
  const textureWidth = props.textureWidth ?? 512;
  const textureHeight = props.textureHeight ?? 768;
  const color = props.color ?? 0xc8b890;
  const position = props.position ?? ([0, 1.5, 0] as [number, number, number]);
  const rotation = props.rotation ?? ([0, 0, 0] as [number, number, number]);
  const clipBias = props.clipBias ?? 0.003;
  let reflector = $state.raw<Reflector | null>(null);

  function resolveScene(): Scene {
    const value = scene as unknown as Scene | { current?: Scene };
    return "current" in value && value.current
      ? value.current
      : (value as Scene);
  }

  function createGeometry(): BufferGeometry {
    if (!props.outline || props.outline.length < 3) {
      return new PlaneGeometry(width, height);
    }

    const shape = new Shape();
    const [first, ...rest] = props.outline;
    shape.moveTo(first![0], first![1]);
    for (const [x, y] of rest) shape.lineTo(x, y);
    shape.closePath();

    const geometry = new ShapeGeometry(shape);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const positions = geometry.getAttribute("position");
    const uv = geometry.attributes.uv;
    if (bounds && uv) {
      const spanX = Math.max(bounds.max.x - bounds.min.x, 0.001);
      const spanY = Math.max(bounds.max.y - bounds.min.y, 0.001);
      for (let index = 0; index < positions.count; index += 1) {
        uv.setXY(
          index,
          (positions.getX(index) - bounds.min.x) / spanX,
          (positions.getY(index) - bounds.min.y) / spanY
        );
      }
      uv.needsUpdate = true;
    }
    return geometry;
  }

  $effect(() => {
    if (reflector) {
      reflector.visible = props.active !== false;
    }
  });

  onMount(() => {
    const geometry = createGeometry();
    const sceneRoot = resolveScene();
    reflector = new Reflector(geometry, {
      clipBias,
      textureWidth,
      textureHeight,
      color,
      ...(props.shader ? { shader: props.shader } : {}),
    });

    if (props.uniforms) {
      const material = reflector.material as ShaderMaterial;
      for (const [key, value] of Object.entries(props.uniforms)) {
        const uniform = material.uniforms[key];
        if (uniform) uniform.value = value;
      }
    }

    reflector.position.set(...position);
    reflector.rotation.set(...rotation);
    reflector.visible = props.active !== false;

    // Mount this outside Threlte's declarative tree because Reflector's
    // onBeforeRender callback only runs when the renderer owns the object.
    sceneRoot.add(reflector);
    props.onReady?.(reflector);

    return () => {
      if (!reflector) return;
      sceneRoot.remove(reflector);
      reflector.getRenderTarget().dispose();
      (reflector.material as ShaderMaterial).dispose();
      geometry.dispose();
      reflector = null;
    };
  });
</script>
