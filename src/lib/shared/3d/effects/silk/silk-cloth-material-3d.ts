import { DoubleSide, MeshPhysicalMaterial, type Texture } from "three";

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
