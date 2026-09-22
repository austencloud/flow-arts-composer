import { describe, it, expect } from "vitest";
import * as appRenderCore from "$lib/shared/render/core/constants/prop-classification";
import * as pictograph from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import * as packageRenderCore from "../../../../../../packages/render-core/src/constants/prop-classification";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/**
 * The prop classification lists live in three places: the pictograph domain
 * enums, the app's render/core copy (which drives calculateBetaOffset), and the
 * @tka/render-core package (the MCP/Node renderer). The copies keep their lists
 * private, so this compares their behaviour over every PropType instead. A prop
 * added to one copy and not the others fails here rather than rendering with a
 * different beta offset in one renderer.
 */

const copies = [
  { name: "pictograph domain", module: pictograph },
  { name: "app render/core", module: appRenderCore },
  { name: "render-core package", module: packageRenderCore },
];

const propTypes = Object.values(PropType);

type Classifier = (propType: string) => unknown;

function table(pick: (module: typeof appRenderCore) => Classifier) {
  return copies.map(({ name, module }) => ({
    name,
    results: Object.fromEntries(propTypes.map((p) => [p, pick(module)(p)])),
  }));
}

function expectAllCopiesAgree(pick: (module: typeof appRenderCore) => Classifier) {
  const [reference, ...others] = table(pick);
  for (const other of others) {
    expect(other.results, `${other.name} vs ${reference!.name}`).toEqual(reference!.results);
  }
}

describe("prop classification copies agree over every PropType", () => {
  it("isUnilateralProp", () => {
    expectAllCopiesAgree((m) => m.isUnilateralProp);
  });

  it("isBuugengFamilyProp", () => {
    expectAllCopiesAgree((m) => m.isBuugengFamilyProp);
  });

  it("isStrictPlacedProp", () => {
    expectAllCopiesAgree((m) => m.isStrictPlacedProp);
  });

  it("getBetaOffsetSize in diamond and box mode", () => {
    expectAllCopiesAgree((m) => (p) => m.getBetaOffsetSize(p, "diamond"));
    expectAllCopiesAgree((m) => (p) => m.getBetaOffsetSize(p, "box"));
  });
});
