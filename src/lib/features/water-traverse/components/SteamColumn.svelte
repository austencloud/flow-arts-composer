<script lang="ts">
  /**
   * A standing column of steam.
   *
   * This is the one object in the Water Traverse that has to work at two very
   * different distances: from 350 m away on the frozen river it is the only
   * evidence that the walk has an end, and from ten metres away it is weather
   * the visitor stands in. A billboard fails the near case and a particle
   * system dense enough for the near case is wasted on the far one, so it is a
   * tapering volume: fbm-scrolling density in a cylinder, faded at the
   * silhouette so it has no rim, and additive so it never occludes anything.
   */
  import { T, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from "three";

  interface Props {
    position: [number, number, number];
    height: number;
    radius: number;
    color?: string;
    /** Peak density. Above ~0.5 the column starts reading as a solid. */
    strength?: number;
    riseSpeed?: number;
    /**
     * The scene's exponential-squared fog. A custom shader gets none of
     * three.js's fog chunks for free, and an unfogged additive column is a
     * bright ghost hanging in a place the fog has already swallowed — visible
     * from 200 m down a flooded trench that should have hidden it entirely.
     */
    fog?: { density: number };
  }

  const props: Props = $props();

  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new Color(props.color ?? "#e6eef0") },
    uStrength: { value: props.strength ?? 0.34 },
    uRiseSpeed: { value: props.riseSpeed ?? 0.16 },
    uHeight: { value: props.height },
    uFogDensity: { value: props.fog?.density ?? 0 },
  };

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vViewDir;
      varying vec3 vNormalW;
      varying float vViewDistance;

      void main() {
        vLocal = position;
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vViewDir = normalize( cameraPosition - world.xyz );
        vViewDistance = length( cameraPosition - world.xyz );
        vNormalW = normalize( mat3( modelMatrix ) * normal );
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uRiseSpeed;
      uniform float uHeight;
      uniform float uFogDensity;

      varying vec3 vLocal;
      varying vec3 vViewDir;
      varying vec3 vNormalW;
      varying float vViewDistance;

      float hash( vec3 p ) {
        p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
        p *= 17.0;
        return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
      }

      float noise( vec3 p ) {
        vec3 i = floor( p );
        vec3 f = fract( p );
        f = f * f * ( 3.0 - 2.0 * f );
        return mix(
          mix( mix( hash( i + vec3( 0, 0, 0 ) ), hash( i + vec3( 1, 0, 0 ) ), f.x ),
               mix( hash( i + vec3( 0, 1, 0 ) ), hash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
          mix( mix( hash( i + vec3( 0, 0, 1 ) ), hash( i + vec3( 1, 0, 1 ) ), f.x ),
               mix( hash( i + vec3( 0, 1, 1 ) ), hash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
          f.z );
      }

      float fbm( vec3 p ) {
        float sum = 0.0;
        float amplitude = 0.5;
        for ( int i = 0; i < 4; i ++ ) {
          sum += noise( p ) * amplitude;
          p *= 2.02;
          amplitude *= 0.5;
        }
        return sum;
      }

      void main() {
        // The column scrolls DOWN through the noise field, which reads as the
        // steam rising through a fixed volume rather than the volume moving.
        vec3 samplePoint = vec3( vLocal.xz * 0.09, vLocal.y * 0.045 - uTime * uRiseSpeed );
        float density = fbm( samplePoint * 3.0 );
        density = smoothstep( 0.34, 0.86, density );

        // Thin out at the top: steam disperses, it does not stop.
        // Cylinder local Y is centred, so shift it to 0-at-the-base first.
        float rise = clamp( vLocal.y / uHeight + 0.5, 0.0, 1.0 );
        density *= 1.0 - rise * 0.72;
        // And at the very base, where it is still water rather than vapour.
        density *= smoothstep( 0.0, 0.06, rise );

        // Fade at the silhouette. Without this the cylinder has a visible rim
        // and the whole thing reads as a prop instead of as weather.
        float facing = abs( dot( normalize( vNormalW ), normalize( vViewDir ) ) );
        density *= smoothstep( 0.0, 0.55, facing );

        // Additive blending adds light, so fog is applied by taking the light
        // away: the same exp2 falloff the scene fog uses, as a gain.
        float fogged = vViewDistance * uFogDensity;
        float alpha = density * uStrength * exp( - fogged * fogged );
        if ( alpha < 0.004 ) discard;
        gl_FragColor = vec4( uColor * ( 0.65 + 0.35 * density ), alpha );
      }
    `,
  });

  useTask((delta) => {
    uniforms.uTime.value += delta;
    // Read the fog every frame: the traverse's fog density is a continuous
    // function of where the visitor is standing, not a constant.
    if (props.fog) uniforms.uFogDensity.value = props.fog.density;
  });

  onDestroy(() => material.dispose());
</script>

<!--
  Three nested shells rather than one. A single surface pair gives two samples
  through the volume and banding you can count; three gives depth for the cost
  of two more draw calls on a 12-triangle-ring cylinder.
-->
{#each [1, 0.68, 0.4] as scale, index (index)}
  <T.Mesh
    position={[
      props.position[0],
      props.position[1] + props.height / 2,
      props.position[2],
    ]}
    renderOrder={10 + index}
  >
    <T.CylinderGeometry
      args={[
        props.radius * scale * 2.1,
        props.radius * scale,
        props.height,
        24,
        1,
        true,
      ]}
    />
    <T is={material} />
  </T.Mesh>
{/each}
