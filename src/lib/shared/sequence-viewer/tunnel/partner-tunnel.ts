/**
 * A partner tunnel: two performers stacked front and back, each doing a
 * published sequence. Its address names both codes, front first
 * (`/tunnel/4UMY-B7Y4`), so a scan never has to guess which of the two was
 * the starter.
 *
 * The viewer's tunnel draws its second stage position turned half a circle
 * (the default two-position formation). The back performer's own sequence is
 * already drawn on the shared grid, so it goes in turned half a circle the
 * other way and lands back on itself.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { rotateSequence } from "#lib/shared/create/services/sequence-transforms.js";
import { PUBLIC_SITE_URL } from "#lib/shared/browse/navigation/browse-route-resolver.js";
import {
  configureShortCodeManager,
  getShortCodeManager,
} from "#lib/shared/qr/get-short-code-manager.js";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import {
  performerSequence,
  type PerformerTransform,
} from "#lib/shared/post-studio-plugin/performer-sequence.js";
import { DEFAULT_CONFIG } from "./tunnel-config";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
  type TunnelComposition,
} from "./tunnel-composition";

export interface PartnerTunnelAddress {
  front: string;
  back: string;
}

const CODE = /^[A-Za-z0-9]{4,6}$/;

/** Reads `4UMY-B7Y4`. Null for anything that is not two codes. */
export function parsePartnerTunnelAddress(
  value: string | null | undefined
): PartnerTunnelAddress | null {
  const parts = (value ?? "").split("-");
  if (parts.length !== 2) return null;
  const [front, back] = parts as [string, string];
  if (!CODE.test(front) || !CODE.test(back)) return null;
  return { front: front.toUpperCase(), back: back.toUpperCase() };
}

export function partnerTunnelPath(address: PartnerTunnelAddress): string {
  return `/tunnel/${address.front}-${address.back}`;
}

const COMPOSITION_ID_PREFIX = "partner-tunnel-";

/**
 * The address a partner tunnel's composition was built from, read back from
 * its id; null for any other composition. The two published sequences can
 * share one sequence id, so their codes are what tell them apart.
 */
export function partnerTunnelAddressOf(
  composition: Pick<TunnelComposition, "id">
): PartnerTunnelAddress | null {
  if (!composition.id.startsWith(COMPOSITION_ID_PREFIX)) return null;
  return parsePartnerTunnelAddress(
    composition.id.slice(COMPOSITION_ID_PREFIX.length)
  );
}

/** A page outside the app shell has no browse loader; reading a code needs none. */
async function findCodeOf(sequence: SequenceData): Promise<string | null> {
  try {
    getShortCodeManager();
  } catch {
    configureShortCodeManager({ loadFullSequenceData: async () => null });
  }
  return getShortCodeManager().findExistingCodeForSequence(sequence);
}

/**
 * The tunnel's public link, when both sequences already have codes. It only
 * reads codes and never makes one, so a sequence without a code gives null.
 */
export async function findPartnerTunnelUrl(
  front: SequenceData,
  back: SequenceData,
  findCode: (sequence: SequenceData) => Promise<string | null> = findCodeOf
): Promise<string | null> {
  try {
    const [frontCode, backCode] = await Promise.all([
      findCode(front),
      findCode(back),
    ]);
    if (!frontCode || !backCode) return null;
    const address = parsePartnerTunnelAddress(`${frontCode}-${backCode}`);
    return address ? `${PUBLIC_SITE_URL}${partnerTunnelPath(address)}` : null;
  } catch {
    return null;
  }
}

function motionKey(
  motion: SequenceData["steps"][number]["motions"]["left"]
): string {
  if (!motion) return "-";
  return [
    motion.startLocation,
    motion.endLocation,
    motion.motionType,
    motion.rotationDirection,
    motion.turns,
    motion.startOrientation,
    motion.endOrientation,
  ].join(" ");
}

function choreographyKey(sequence: SequenceData): string {
  return sequence.steps
    .map(
      (step) =>
        `${motionKey(step.motions.left)}|${motionKey(step.motions.right)}`
    )
    .join(";");
}

const TRANSFORMS: readonly PerformerTransform[] = [
  {},
  { mirror: true },
  { flip: true },
  { swap: true },
  { mirror: true, flip: true },
  { mirror: true, swap: true },
  { flip: true, swap: true },
  { mirror: true, flip: true, swap: true },
];

/**
 * How the back performer's sequence comes from the front one, or null when
 * it is a different sequence altogether.
 */
export async function partnerTransform(
  front: SequenceData,
  back: SequenceData
): Promise<PerformerTransform | null> {
  if (front.steps.length !== back.steps.length) return null;
  const target = choreographyKey(back);
  for (const transform of TRANSFORMS) {
    const candidate = await performerSequence(front, transform);
    if (choreographyKey(candidate) === target) return transform;
  }
  return null;
}

/** "mirrored, flipped, hands swapped"; empty for no change. */
export function describePartnerTransform(
  transform: PerformerTransform
): string {
  return [
    transform.mirror ? "mirrored" : null,
    transform.flip ? "flipped" : null,
    transform.swap ? "hands swapped" : null,
  ]
    .filter((word): word is string => word !== null)
    .join(", ");
}

/** The viewer's tunnel cast: front at the base position, back behind it. */
export async function partnerTunnelComposition(
  address: PartnerTunnelAddress,
  front: SequenceData,
  back: SequenceData
): Promise<TunnelComposition> {
  // The second position turns its performer half a circle (4 × 45°).
  const backBeforeTurn = await rotateSequence(back, 4, motionQueryHandler);
  return createTunnelComposition(
    [
      // Labels are for people, who know the two by position; the codes stay
      // in the address.
      createIndependentTunnelPerformer(front, 0, "Front", {
        sourceSequenceId: front.id,
      }),
      createIndependentTunnelPerformer(backBeforeTurn, 1, "Back", {
        sourceSequenceId: back.id,
      }),
    ],
    {
      id: `${COMPOSITION_ID_PREFIX}${address.front}-${address.back}`,
      // The name is read as text, so the word is the one people say ("DJII"),
      // not the walked "DJIIDJII".
      name: `${front.word ? simplifyRepeatedWord(front.word) : address.front} tunnel`,
      formation: { ...DEFAULT_CONFIG, fold: 2 },
    }
  );
}
