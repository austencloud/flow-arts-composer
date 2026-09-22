import type { RawMotion, RawSequence } from "../museum-exhibit-sequences";
import type { ExhibitCase, TndCategory, WingDeclaration } from "./types";
import { normalizeLegacyStep } from "@tka/tka-types";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

/**
 * The machine-checkable grammar for wing declarations. Reads the owners it
 * cross-references (catalog JSON, raw museum sequences, floor-plan
 * performers) through this context — it never copies their data.
 */
export interface WingValidationContext {
  catalog: CatalogEntry[];
  rawSequences: Record<string, RawSequence>;
  /** roomId → performer refIds present in the era's floor plan. */
  performersByRoom: Record<string, readonly string[]>;
}

/** The slice of a tnd-base-words.json row the validator reads. */
export interface CatalogEntry {
  id: string;
  steps: {
    letter: string;
    startPlacement: string;
    endPlacement: string;
    stepNumber: number;
    motions: { left: RawMotion; right: RawMotion };
  }[];
}

export type WingFindingLevel = "error" | "pending";

export interface WingFinding {
  level: WingFindingLevel;
  wingId: string;
  code:
    | "beat-order"
    | "catalog-missing"
    | "word-mismatch"
    | "sequence-missing"
    | "verbatim-mismatch"
    | "case-count"
    | "category-prefix"
    | "duplicate-word"
    | "showcase-pending"
    | "station-pending"
    | "ensemble-on-showcase"
    | "ensemble-prop"
    | "payoff-unknown-case"
    | "chain-broken"
    | "empty-field";
  message: string;
}

const BEAT_ORDER = ["threshold", "opener", "cases", "payoff", "exit"] as const;

/** Family sizes after reversal collapse (PM = MP): QS has four rows, the rest three. */
const CASE_COUNT_BY_CATEGORY: Record<TndCategory, number> = {
  SS: 3,
  SO: 3,
  TS: 3,
  TO: 3,
  QS: 4,
  QO: 3,
};

const CATALOG_PREFIX_BY_CATEGORY: Record<TndCategory, string> = {
  SS: "tnd-split-same-",
  SO: "tnd-split-opp-",
  TS: "tnd-tog-same-",
  TO: "tnd-tog-opp-",
  QS: "tnd-quarter-same-",
  QO: "tnd-quarter-opp-",
};

/** Eternal-props seal: static dual-wield only, never poi. The type enforces
 * this for TS manifests; the validator re-checks for future JSON-era ones. */
const STATIC_DUAL_WIELD_PROPS = new Set(["staff", "club", "fan", "buugeng"]);

const MOTION_FIELDS = [
  "startLocation",
  "endLocation",
  "motionType",
  "rotationDirection",
  "startOrientation",
  "endOrientation",
] as const;

function motionsMatch(a: RawMotion, b: RawMotion): boolean {
  return MOTION_FIELDS.every((field) => a[field] === b[field]);
}

function checkVerbatimBinding(
  wing: WingDeclaration,
  exhibitCase: ExhibitCase,
  context: WingValidationContext,
  findings: WingFinding[]
): void {
  const catalogEntry = context.catalog.find(
    (entry) => entry.id === exhibitCase.catalogId
  );
  if (!catalogEntry) {
    findings.push({
      level: "error",
      wingId: wing.wingId,
      code: "catalog-missing",
      message: `${exhibitCase.catalogId} is not in the catalog`,
    });
    return;
  }
  const catalogSteps = catalogEntry.steps
    .filter((step) => step.stepNumber >= 1)
    .sort((a, b) => a.stepNumber - b.stepNumber);
  const catalogWord = catalogSteps.map((step) => step.letter).join("");
  if (catalogWord !== exhibitCase.word) {
    findings.push({
      level: "error",
      wingId: wing.wingId,
      code: "word-mismatch",
      message: `case ${exhibitCase.word} vs catalog ${catalogWord} (${exhibitCase.catalogId})`,
    });
  }
  const sequence = context.rawSequences[exhibitCase.sequenceKey];
  if (!sequence) {
    findings.push({
      level: "error",
      wingId: wing.wingId,
      code: "sequence-missing",
      message: `${exhibitCase.sequenceKey} is not in museum-exhibit-sequences`,
    });
    return;
  }
  if (stripWordNotation(sequence.word) !== exhibitCase.word) {
    findings.push({
      level: "error",
      wingId: wing.wingId,
      code: "word-mismatch",
      message: `case ${exhibitCase.word} vs museum sequence word ${sequence.word} (${exhibitCase.sequenceKey})`,
    });
  }
  const museumSteps = sequence.steps
    .filter((step) => step.stepNumber >= 1)
    .sort((a, b) => a.stepNumber - b.stepNumber);
  if (museumSteps.length !== catalogSteps.length) {
    findings.push({
      level: "error",
      wingId: wing.wingId,
      code: "verbatim-mismatch",
      message: `${exhibitCase.sequenceKey}: ${museumSteps.length} steps vs catalog ${catalogSteps.length}`,
    });
    return;
  }
  for (let index = 0; index < catalogSteps.length; index += 1) {
    const fromCatalog = normalizeLegacyStep(catalogSteps[index]!);
    const fromMuseum = museumSteps[index]!;
    const stepMatches =
      fromCatalog.letter === fromMuseum.letter &&
      fromCatalog.startPlacement === fromMuseum.startPlacement &&
      fromCatalog.endPlacement === fromMuseum.endPlacement &&
      motionsMatch(fromCatalog.motions.left, fromMuseum.leftMotion) &&
      motionsMatch(fromCatalog.motions.right, fromMuseum.rightMotion);
    if (!stepMatches) {
      findings.push({
        level: "error",
        wingId: wing.wingId,
        code: "verbatim-mismatch",
        message: `${exhibitCase.sequenceKey} step ${fromCatalog.stepNumber} drifts from ${exhibitCase.catalogId}`,
      });
    }
  }
}

function checkStation(
  wing: WingDeclaration,
  stationRef: string,
  role: "showcase" | "station",
  context: WingValidationContext,
  findings: WingFinding[]
): void {
  const performers = context.performersByRoom[wing.roomId] ?? [];
  if (performers.includes(stationRef)) return;
  findings.push({
    level: "pending",
    wingId: wing.wingId,
    code: role === "showcase" ? "showcase-pending" : "station-pending",
    message: `${stationRef} has no floor-plan station yet (Gate 1 placement)`,
  });
}

export function validateWingDeclarations(
  wings: readonly WingDeclaration[],
  context: WingValidationContext
): WingFinding[] {
  const findings: WingFinding[] = [];

  for (const wing of wings) {
    // Beat order and completeness — the type enforces this for TS manifests;
    // re-checked at runtime for future JSON-era ones.
    const kinds = wing.beats.map((beat) => beat.kind);
    if (
      kinds.length !== BEAT_ORDER.length ||
      BEAT_ORDER.some((expected, index) => kinds[index] !== expected)
    ) {
      findings.push({
        level: "error",
        wingId: wing.wingId,
        code: "beat-order",
        message: `beats are [${kinds.join(", ")}], expected [${BEAT_ORDER.join(", ")}]`,
      });
      continue;
    }
    const [threshold, opener, casesBeat, payoff] = wing.beats;

    // Non-empty canon fields.
    const requiredText: [string, string][] = [
      ["teachingSentence", wing.teachingSentence],
      ["uniqueObservable", wing.uniqueObservable],
      ["barrier.kind", wing.barrier.kind],
      ["barrier.expression", wing.barrier.expression],
      ["threshold.stamp", threshold.stamp],
    ];
    for (const [field, value] of requiredText) {
      if (!value.trim()) {
        findings.push({
          level: "error",
          wingId: wing.wingId,
          code: "empty-field",
          message: `${field} is empty`,
        });
      }
    }

    // One case per word; category prefix; canonical binding; stations.
    const words = new Set<string>();
    const showcaseRefs = new Set(
      casesBeat.cases.map((c) => c.showcaseStationRef)
    );
    for (const exhibitCase of casesBeat.cases) {
      if (words.has(exhibitCase.word)) {
        findings.push({
          level: "error",
          wingId: wing.wingId,
          code: "duplicate-word",
          message: `${exhibitCase.word} declared twice`,
        });
      }
      words.add(exhibitCase.word);
      const prefix = CATALOG_PREFIX_BY_CATEGORY[wing.mode.category];
      if (!exhibitCase.catalogId.startsWith(prefix)) {
        findings.push({
          level: "error",
          wingId: wing.wingId,
          code: "category-prefix",
          message: `${exhibitCase.catalogId} does not carry ${prefix}`,
        });
      }
      checkVerbatimBinding(wing, exhibitCase, context, findings);
      checkStation(
        wing,
        exhibitCase.showcaseStationRef,
        "showcase",
        context,
        findings
      );
      for (const member of exhibitCase.ensemble ?? []) {
        if (showcaseRefs.has(member.stationRef)) {
          findings.push({
            level: "error",
            wingId: wing.wingId,
            code: "ensemble-on-showcase",
            message: `ensemble ref ${member.stationRef} is a showcase station (rider 2)`,
          });
        } else {
          checkStation(wing, member.stationRef, "station", context, findings);
        }
        if (!STATIC_DUAL_WIELD_PROPS.has(member.prop)) {
          findings.push({
            level: "error",
            wingId: wing.wingId,
            code: "ensemble-prop",
            message: `${member.prop} is not a static dual-wield prop (eternal-props seal)`,
          });
        }
      }
    }
    if (casesBeat.cases.length !== CASE_COUNT_BY_CATEGORY[wing.mode.category]) {
      findings.push({
        level: "error",
        wingId: wing.wingId,
        code: "case-count",
        message: `${casesBeat.cases.length} cases, ${wing.mode.category} needs ${CASE_COUNT_BY_CATEGORY[wing.mode.category]}`,
      });
    }

    // The opener binds like a case (same catalog + sequence checks); its
    // synthetic ExhibitCase is only a vehicle for reusing checkVerbatimBinding,
    // which never touches stations. The opener's own station is checked with
    // role "station", so pending is allowed pre-Gate-1.
    checkVerbatimBinding(
      wing,
      {
        word:
          context.catalog
            .find((entry) => entry.id === opener.catalogId)
            ?.steps.filter((step) => step.stepNumber >= 1)
            .sort((a, b) => a.stepNumber - b.stepNumber)
            .map((step) => step.letter)
            .join("") ?? "",
        catalogId: opener.catalogId,
        sequenceKey: opener.sequenceKey,
        showcaseStationRef: opener.stationRef,
        triptych: { screen: true, cardSign: true },
      },
      context,
      findings
    );
    checkStation(wing, opener.stationRef, "station", context, findings);

    // Payoff visibility.
    checkStation(wing, payoff.viewpointRef, "station", context, findings);
    for (const visible of payoff.visibleCases) {
      if (!words.has(visible)) {
        findings.push({
          level: "error",
          wingId: wing.wingId,
          code: "payoff-unknown-case",
          message: `payoff names undeclared case ${visible}`,
        });
      }
    }
  }

  // Walk-order chain: one head, one null tail, every wing visited once.
  const byId = new Map(wings.map((wing) => [wing.wingId, wing]));
  const referenced = new Set(
    wings
      .map((wing) => wing.beats[4].toWingId)
      .filter((id): id is string => id !== null)
  );
  const heads = wings.filter((wing) => !referenced.has(wing.wingId));
  let chainOk = heads.length === 1;
  if (chainOk) {
    const visited = new Set<string>();
    let cursor: WingDeclaration | undefined = heads[0];
    while (cursor && !visited.has(cursor.wingId)) {
      visited.add(cursor.wingId);
      const next = cursor.beats[4].toWingId;
      cursor = next === null ? undefined : byId.get(next);
    }
    chainOk = visited.size === wings.length;
  }
  if (!chainOk && wings.length > 0) {
    findings.push({
      level: "error",
      wingId: heads[0]?.wingId ?? wings[0]!.wingId,
      code: "chain-broken",
      message: "exit links do not form one path visiting every wing once",
    });
  }

  return findings;
}
