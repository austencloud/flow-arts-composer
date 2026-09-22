import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  MandalaPaths,
  SVGPathData,
} from "$lib/shared/mandala/domain/mandala-types";
import {
  orbitKey,
  shapeKey,
} from "$lib/shared/mandala/services/mandala-fingerprint";
import {
  createMandalaPrimitiveRef,
  sequenceDisplayName,
} from "../domain/mandala-primitive-reference";
import type { MandalaPrimitiveRef } from "../domain/sticker-types";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

export type CatalogShapeScope = "solo" | "combined";
export type SoloProp = "left" | "right";

export interface CatalogShapeMember {
  key: string;
  scope: CatalogShapeScope;
  sequence: SequenceData;
  word: string;
  fullPaths: MandalaPaths;
  previewPaths: MandalaPaths;
  primitiveRef: MandalaPrimitiveRef;
  prop?: SoloProp;
}

export interface CatalogShapeGroup {
  key: string;
  scope: CatalogShapeScope;
  representative: CatalogShapeMember;
  members: CatalogShapeMember[];
}

function soloPreview(paths: readonly SVGPathData[]): MandalaPaths {
  return { left: [...paths], right: [], purple: [] };
}

export function createCatalogShapeMembers(
  sequence: SequenceData,
  fullPaths: MandalaPaths,
  scope: CatalogShapeScope
): CatalogShapeMember[] {
  const word = sequenceDisplayName(sequence);

  if (scope === "combined") {
    return [
      {
        key: shapeKey(fullPaths),
        scope,
        sequence,
        word,
        fullPaths,
        previewPaths: fullPaths,
        primitiveRef: createMandalaPrimitiveRef(sequence, fullPaths),
      },
    ];
  }

  const solos: Array<{ prop: SoloProp; paths: SVGPathData[] }> = [
    { prop: "left", paths: fullPaths.left },
    { prop: "right", paths: fullPaths.right },
  ];

  return solos
    .filter(({ paths }) => paths.length > 0)
    .map(({ prop, paths }) => {
      const previewPaths = soloPreview(paths);
      return {
        key: orbitKey(previewPaths),
        scope,
        sequence,
        word,
        fullPaths,
        previewPaths,
        primitiveRef: createMandalaPrimitiveRef(sequence, fullPaths),
        prop,
      };
    });
}

export function addCatalogShapeMembers(
  groups: Map<string, CatalogShapeGroup>,
  members: readonly CatalogShapeMember[]
): void {
  for (const member of members) {
    const existing = groups.get(member.key);
    if (existing) {
      existing.members.push(member);
    } else {
      groups.set(member.key, {
        key: member.key,
        scope: member.scope,
        representative: member,
        members: [member],
      });
    }
  }
}

export function sortCatalogShapeGroups(
  groups: ReadonlyMap<string, CatalogShapeGroup>
): CatalogShapeGroup[] {
  return [...groups.values()].sort(
    (a, b) =>
      b.members.length - a.members.length ||
      stripWordNotation(a.representative.word).localeCompare(
        stripWordNotation(b.representative.word)
      )
  );
}
