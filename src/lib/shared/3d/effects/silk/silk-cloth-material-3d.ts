import { DoubleSide, MeshPhysicalMaterial, type Texture } from "three";

/** How each palette's fabric handles light. */
export interface SilkFabricProfile3D {
  /** Surface roughness: low reads as satin, high as velvet. */
  roughness: number;
  /** Strength of the soft cloth sheen at grazing angles. */
  sheen: number;
  /** Light from behind that shows through the fabric. */
  translucency: number;
  /** Metallic share, for leaf that is really foil. */
  metalness: number;
  /** How far the body color leans toward the prop color. */
  identityMix: number;
}

const PROFILES: Record<string, SilkFabricProfile3D> = {
  satin: { roughness: 0.3, sheen: 0.9, translucency: 0.35, metalness: 0, identityMix: 0.68 },
  velvet: { roughness: 0.85, sheen: 1, translucency: 0.06, metalness: 0, identityMix: 0.2 },
  ethereal: { roughness: 0.42, sheen: 0.8, translucency: 0.75, metalness: 0, identityMix: 0.22 },
  shadow: { roughness: 0.7, sheen: 0.45, translucency: 0.2, metalness: 0, identityMix: 0.18 },
  gold_leaf: { roughness: 0.24, sheen: 0.6, translucency: 0.05, metalness: 0.55, identityMix: 0.06 },
  ember: { roughness: 0.45, sheen: 0.7, translucency: 0.6, metalness: 0, identityMix: 0.04 },
  custom: { roughness: 0.4, sheen: 0.75, translucency: 0.3, metalness: 0, identityMix: 0.42 },
};

export function resolveSilkFabricProfile3D(paletteId: string): SilkFabricProfile3D {
  return PROFILES[paletteId] ?? PROFILES.custom!;
}

/**
 * Lit fabric. Each vertex carries its own roughness, sheen, translucency and
 * metalness (aFabric), opacity and glow (aLook) and sheen color (aSheen), so
 * streamers with different palettes share one draw. (three's anisotropic
 * highlight is left off: on fabric that twists edge-on it returns NaN, and
 * bloom smears that over the whole frame.)
 */
export function createSilkClothMaterial3D(envMap: Texture): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.4,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: 0xffffff,
    envMap,
    envMapIntensity: 1.1,
    side: DoubleSide,
    transparent: true,
    depthWrite: true,
    fog: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute vec4 aFabric;
         attribute vec2 aLook;
         attribute vec3 aSheen;
         varying vec4 vSilkFabric;
         varying vec2 vSilkLook;
         varying vec3 vSilkSheen;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vSilkFabric = aFabric;
         vSilkLook = aLook;
         vSilkSheen = aSheen;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec4 vSilkFabric;
         varying vec2 vSilkLook;
         varying vec3 vSilkSheen;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.a *= vSilkLook.x;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         roughnessFactor = vSilkFabric.x;`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
         metalnessFactor = vSilkFabric.w;`
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
         #ifdef USE_SHEEN
           material.sheenColor = vSilkSheen * vSilkFabric.y;
         #endif`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += diffuseColor.rgb * vSilkLook.y;`
      )
      .replace(
        "#include <opaque_fragment>",
        `// Thin silk passes light through: whatever lights its far side glows
         // through in the fabric's own color.
         vec3 silkThrough = vec3( 0.0 );
         #if NUM_DIR_LIGHTS > 0
           for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
             silkThrough += directionalLights[ i ].color * saturate( dot( - normal, directionalLights[ i ].direction ) );
           }
         #endif
         #if NUM_HEMI_LIGHTS > 0
           for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
             silkThrough += getHemisphereLightIrradiance( hemisphereLights[ i ], - normal );
           }
         #endif
         #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
           silkThrough += getIBLIrradiance( - normal ) * envMapIntensity;
         #endif
         outgoingLight += diffuseColor.rgb * silkThrough * vSilkFabric.z * 0.3 * ( 1.0 - vSilkFabric.w );
         #include <opaque_fragment>`
      );
  };
  return material;
}
