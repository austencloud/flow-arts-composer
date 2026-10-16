<script lang="ts">
  /**
   * The sky over the Water Traverse.
   *
   * A flat clear colour was the single largest thing making an open landscape
   * read as a corridor: with no gradient and no sun, the top half of every
   * frame was one dead value and the ridges had nothing to be silhouetted
   * against. This is a follow-camera dome with a horizon-to-zenith ramp and a
   * sun, driven by the same atmosphere sample as the fog — so underwater it
   * simply becomes the water column overhead, which is what a sky is down
   * there.
   */
  import { T, useTask, useThrelte } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { BackSide, Mesh, ShaderMaterial } from "three";
  import type { Color, Vector3 } from "three";

  interface Props {
    /** Colour at the horizon. Match the fog or the seam is visible. */
    horizon: Color;
    zenith: Color;
    sunColor: Color;
    /** Direction TO the sun, world space. */
    sunDirection: Vector3;
    /**
     * Live submersion, 0 above the waterline to 1 under it. A box rather than
     * a number because the scene mutates its atmosphere in place every frame —
     * routing that through Svelte reactivity would allocate on every tick to
     * deliver a value the shader can just read.
     */
    live: { submersion: number };
  }

  const props: Props = $props();
  const { camera } = useThrelte();

  // The colour uniforms hold the caller's own objects, so the scene's
  // per-frame mutation of them is already the shader's input.
  const uniforms = {
    uHorizon: { value: props.horizon },
    uZenith: { value: props.zenith },
    uSunColor: { value: props.sunColor },
    uSunDirection: { value: props.sunDirection },
    uSubmersion: { value: 0 },
  };

  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    // Drawn first with no depth test at all, which is what makes it a
    // BACKDROP rather than a very large object: a 900 m dome was silently
    // clipped by the camera's far plane, so every upward view fell through to
    // the flat clear colour and the trench looked roofed in black.
    depthTest: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize( position );
        // Translation only: the dome rides with the camera so it can never be
        // reached, but it must not inherit any rotation or the sun would move.
        vec3 world = position + vec3( modelMatrix[ 3 ] );
        gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      uniform float uSubmersion;

      varying vec3 vDirection;

      void main() {
        vec3 dir = normalize( vDirection );

        // pow() rather than a linear ramp: the real sky holds its horizon band
        // low and then climbs, and a linear ramp reads as a paint gradient.
        float height = clamp( dir.y, 0.0, 1.0 );
        // Above water the sky darkens toward the zenith. Underwater it does
        // the opposite: the surface overhead is the only light source, and a
        // diver looking up sees the brightest thing in the world. Flipping the
        // ramp with submersion is what keeps the trench from going black
        // straight up.
        vec3 sky = mix( uHorizon, uZenith, pow( height, 0.62 ) );

        // Underwater the dome is not a sky, it is the water column, and its
        // gradient runs the other way: the surface overhead is the only light
        // in the world and a diver looking up sees the brightest thing there
        // is. uZenith is the DARKER of the pair, so underwater it is dropped
        // entirely and the ramp climbs off the horizon instead.
        // Starts AT the horizon colour, not below it: the water column has to
        // meet the fog exactly where the terrain stops, or the open water above
        // the seabed ridges reads as a black band instead of as more sea.
        vec3 underwater = mix( uHorizon, uHorizon * 2.9, pow( height, 0.7 ) );
        sky = mix( sky, underwater, uSubmersion );

        // Below the horizon, settle to the horizon colour so the dome never
        // shows a hard edge where the terrain does not reach.
        sky = mix( uHorizon, sky, smoothstep( -0.12, 0.02, dir.y ) );

        float cosSun = dot( dir, normalize( uSunDirection ) );
        // Underwater the disc dissolves into the broad bright patch that is
        // all a diver ever sees of it.
        float discEdge = mix( 0.9993, 0.965, uSubmersion );
        float disc = smoothstep( discEdge, discEdge + 0.0016, cosSun );
        float halo = pow( max( cosSun, 0.0 ), mix( 220.0, 14.0, uSubmersion ) );

        sky += uSunColor * ( disc * mix( 2.6, 0.9, uSubmersion ) + halo * 0.55 );

        gl_FragColor = vec4( sky, 1.0 );
      }
    `,
  });

  let dome = $state.raw<Mesh>();

  useTask(() => {
    uniforms.uSubmersion.value = props.live.submersion;
    const cam = camera.current;
    if (cam && dome) dome.position.copy(cam.position);
  });

  onDestroy(() => material.dispose());
</script>

<T.Mesh
  bind:ref={dome}
  renderOrder={-1000}
  frustumCulled={false}
  oncreate={(mesh: Mesh) => {
    mesh.matrixAutoUpdate = true;
  }}
>
  <T.SphereGeometry args={[200, 48, 28]} />
  <T is={material} />
</T.Mesh>
