import { z } from "zod";
import {
  normalizeLegacyMotion,
  normalizeLegacyMotionRecord,
  Plane,
} from "@tka/tka-types";
import { Letter } from "../../../../foundation/domain/models/letter";
import {
  GridLocation,
  GridPlacement,
} from "../../../grid/domain/enums/grid-enums";
import { PropType } from "../../../prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../enums/pictograph-enums";

const CoordinateSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .nullable();

const ArrowPlacementDataSchema = z.object({
  positionX: z.number().default(0.0),
  positionY: z.number().default(0.0),
  rotationAngle: z.number().default(0.0),
  coordinates: CoordinateSchema.default(null),
  svgCenter: CoordinateSchema.default(null),
  svgMirrored: z.boolean().default(false),
});

const defaultArrowPlacementData = {
  positionX: 0.0,
  positionY: 0.0,
  rotationAngle: 0.0,
  coordinates: null,
  svgCenter: null,
  svgMirrored: false,
};

const PropPlacementDataSchema = z.object({
  positionX: z.number().default(0.0),
  positionY: z.number().default(0.0),
  rotationAngle: z.number().default(0.0),
  coordinates: CoordinateSchema.default(null),
  svgCenter: CoordinateSchema.default(null),
});

const defaultPropPlacementData = {
  positionX: 0.0,
  positionY: 0.0,
  rotationAngle: 0.0,
  coordinates: null,
  svgCenter: null,
};

const MotionDataSchema = z.preprocess(
  normalizeLegacyMotion,
  z.object({
    motionType: z.nativeEnum(MotionType).default(MotionType.STATIC),
    rotationDirection: z
      .nativeEnum(RotationDirection)
      .default(RotationDirection.NO_ROTATION),
    startLocation: z.nativeEnum(GridLocation).default(GridLocation.NORTH),
    endLocation: z.nativeEnum(GridLocation).default(GridLocation.NORTH),
    turns: z.union([z.number(), z.literal("fl")]).default(0.0),
    startOrientation: z.nativeEnum(Orientation).default(Orientation.IN),
    endOrientation: z.nativeEnum(Orientation).default(Orientation.IN),
    isVisible: z.boolean().default(true),
    propType: z.nativeEnum(PropType).default(PropType.STAFF),
    arrowLocation: z.nativeEnum(GridLocation).default(GridLocation.NORTH),
    hand: z.nativeEnum(HandSide).default(HandSide.LEFT),
    arrowPlacementData: ArrowPlacementDataSchema.default(
      defaultArrowPlacementData
    ),
    propPlacementData: PropPlacementDataSchema.default(
      defaultPropPlacementData
    ),
    prefloatMotionType: z.nativeEnum(MotionType).optional(),
    prefloatRotationDirection: z.nativeEnum(RotationDirection).optional(),
    plane: z.nativeEnum(Plane).optional(),
  })
);

const PictographDataObjectSchema = z.object({
  id: z
    .string()
    .min(1)
    .default(() => crypto.randomUUID()),
  letter: z.nativeEnum(Letter).nullable().default(null),
  startPlacement: z.nativeEnum(GridPlacement).nullable().default(null),
  endPlacement: z.nativeEnum(GridPlacement).nullable().default(null),
  motions: z
    .preprocess(
      normalizeLegacyMotionRecord,
      z.record(z.nativeEnum(HandSide), MotionDataSchema)
    )
    .optional()
    .default({} as Record<HandSide, z.infer<typeof MotionDataSchema>>),
});

const PictographDataSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    ...(record.motions !== undefined && {
      motions: normalizeLegacyMotionRecord(record.motions),
    }),
  };
}, PictographDataObjectSchema);

export {
  ArrowPlacementDataSchema,
  CoordinateSchema,
  MotionDataSchema,
  PictographDataObjectSchema,
  PictographDataSchema,
  PropPlacementDataSchema,
};
