<script lang="ts">
  import GuideSection from "../../_components/GuideSection.svelte";
  import GuidePictographGrid from "../../_components/GuidePictographGrid.svelte";
  import { getGuideData } from "../../_data/guide-data-context";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  const data = getGuideData();

  function p(id: string) {
    return data.pictographs[id] ?? null;
  }

  const alphaRows = [
    {
      label: "Alpha",
      sublabel: "Hands across from each other",
      cells: [
        { data: p("pos-alpha1") },
        { data: p("pos-alpha2") },
        { data: p("pos-alpha3") },
        { data: p("pos-alpha4") },
      ],
    },
  ];

  const betaRows = [
    {
      label: "Beta",
      sublabel: "Hands at the same point",
      cells: [
        { data: p("pos-beta1") },
        { data: p("pos-beta2") },
        { data: p("pos-beta3") },
        { data: p("pos-beta4") },
      ],
    },
  ];

  const gammaRows = [
    {
      label: "Gamma",
      sublabel: "Hands form a right angle",
      cells: [
        { data: p("pos-gamma1") },
        { data: p("pos-gamma2") },
        { data: p("pos-gamma3") },
        { data: p("pos-gamma4") },
      ],
    },
  ];
</script>

<GuideSection id="hand-placements" title="Hand Placements">
  <p>
    There are multiple ways to combine two hand points to form a hand placement.
    Placements can be rotated or mirrored. Red = Right and Blue = Left.
  </p>
  <p>
    In The Kinetic Alphabet, our first three placements are called Alpha, Beta, and Gamma.
  </p>

  <h3 class="type-dual-shift">Alpha</h3>
  <p>In Alpha, the hands occupy the points across from each other.</p>
  <GuidePictographGrid rows={alphaRows} showArrows={false} propType={PropType.HAND} />

  <h3 class="type-dual-shift">Beta</h3>
  <p>In Beta, the hands occupy the same point.</p>
  <GuidePictographGrid rows={betaRows} showArrows={false} propType={PropType.HAND} />

  <h3 class="type-dual-shift">Gamma</h3>
  <p>In Gamma, the hands form a right angle.</p>
  <GuidePictographGrid rows={gammaRows} showArrows={false} propType={PropType.HAND} />
</GuideSection>
