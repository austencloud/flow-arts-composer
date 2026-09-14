<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";
  import ShapeMatrixApp from "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte";
  import type { ShapeMatrixAppSnapshot } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
  import {
    readShapeMatrixRouteState,
    writeShapeMatrixRouteState,
  } from "./_state/shape-matrix-url";
  import {
    KINETIC_SHAPE_ENGINE_DESCRIPTION,
    KINETIC_SHAPE_ENGINE_NAME,
    ORIGINAL_SHAPE_MATRIX_NAME,
    ORIGINAL_SHAPE_MATRIX_URL,
    ORIGINAL_SHAPE_MATRIX_VTG_RATIOS,
    KINETIC_SHAPE_ENGINE_LEGACY_NAME,
    SHAPE_MATRIX_EXPLORER_LEGACY_NAME,
  } from "$lib/shared/shape-matrix/app/shape-engine-identity";

  const TITLE = `${KINETIC_SHAPE_ENGINE_NAME} | Flow Arts Composer`;
  const DESCRIPTION = KINETIC_SHAPE_ENGINE_DESCRIPTION;
  const CANONICAL_URL = "https://tkaflowarts.com/shape-engine";
  const ROUTE_STATE_PARAMS = [
    "level",
    "turn",
    "blueTurn",
    "redTurn",
    "axis",
    "labels",
    "prop",
    "driver",
    "size",
    "blue",
    "red",
    "mode",
    "propMode",
    "theory",
    "ratio",
    "spin",
  ];
  const persistence = {
    restore: (): ShapeMatrixAppSnapshot | null => {
      const params = new URLSearchParams(window.location.search);
      return ROUTE_STATE_PARAMS.some((name) => params.has(name))
        ? readShapeMatrixRouteState(params.toString())
        : null;
    },
    persist: (snapshot: ShapeMatrixAppSnapshot): void => {
      mutateCurrentUrl((url) => writeShapeMatrixRouteState(url, snapshot));
    },
    // The share link is the same address the app keeps current, written for
    // the snapshot the app asks for (its notation may differ from the bar).
    link: (snapshot: ShapeMatrixAppSnapshot): string => {
      const url = new URL(window.location.href);
      writeShapeMatrixRouteState(url, snapshot);
      return url.href;
    },
  };
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={CANONICAL_URL} ogType="website">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "${KINETIC_SHAPE_ENGINE_NAME}",
    "alternateName": ["${KINETIC_SHAPE_ENGINE_LEGACY_NAME}", "${SHAPE_MATRIX_EXPLORER_LEGACY_NAME}"],
    "url": "${CANONICAL_URL}",
    "description": "${DESCRIPTION}",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "isBasedOn": {
      "@type": "CreativeWork",
      "name": "${ORIGINAL_SHAPE_MATRIX_NAME}",
      "url": "${ORIGINAL_SHAPE_MATRIX_URL}",
      "description": "A 12-by-12 matrix built from VTG ${ORIGINAL_SHAPE_MATRIX_VTG_RATIOS} driving-style ratios.",
      "creator": {
        "@type": "Person",
        "name": "Lorq Nichols",
        "alternateName": "Spin Science"
      }
    },
    "provider": {
      "@type": "Organization",
      "name": "The Kinetic Alphabet",
      "url": "https://tkaflowarts.com/"
    }
  }
  </script>`}
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://tkaflowarts.com/" },
      { "@type": "ListItem", "position": 2, "name": "Flow Arts History", "item": "https://tkaflowarts.com/history" },
      { "@type": "ListItem", "position": 3, "name": "${KINETIC_SHAPE_ENGINE_NAME}", "item": "${CANONICAL_URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="shape-matrix-page">
  <ShapeMatrixApp {persistence} />
</div>

<style>
  .shape-matrix-page {
    position: fixed;
    inset: 0;
    z-index: 2;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
