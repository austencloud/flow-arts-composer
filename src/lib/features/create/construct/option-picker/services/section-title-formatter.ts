/**
 * Section Title Formatter
 *
 * Handles formatting of section titles with colored text and descriptions.
 * Extracted from OptionViewer.svelte.
 */

import { t } from "#lib/shared/i18n/i18n.svelte.js";
import {
  getColoredText,
  getColoredTextParts,
  type ColoredTextPart,
} from "./letter-type-text-painter";

export type LetterTypeKey =
  | "Type1"
  | "Type2"
  | "Type3"
  | "Type4"
  | "Type5"
  | "Type6";
export type LetterTypeGroupKey = "Type1" | "Type2" | "Type3" | "Types 4-6";
export type LetterTypeTranslationKey =
  | "create_type_dual_shift"
  | "create_type_shift"
  | "create_type_cross_shift"
  | "create_type_dash"
  | "create_type_dual_dash"
  | "create_type_static";

export interface LetterTypeDescriptor {
  key: LetterTypeKey;
  typeName: string;
  description: string;
  explanation: string;
  translationKey: LetterTypeTranslationKey;
  coloredParts: ReadonlyArray<ColoredTextPart>;
}

export interface LetterTypeGroupDescriptor {
  key: LetterTypeGroupKey;
  typeName: string;
  shortLabel: string;
  memberKeys: ReadonlyArray<LetterTypeKey>;
}

export interface LetterTypeGroupPresentation {
  accessibleName: string;
  coloredParts: ReadonlyArray<ColoredTextPart>;
  paletteColors: ReadonlyArray<string>;
}

function letterType(
  key: LetterTypeKey,
  typeName: string,
  description: string,
  explanation: string,
  translationKey: LetterTypeTranslationKey
): LetterTypeDescriptor {
  return {
    key,
    typeName,
    description,
    explanation,
    translationKey,
    coloredParts: getColoredTextParts(description),
  };
}

export const LETTER_TYPE_DESCRIPTORS = {
  Type1: letterType(
    "Type1",
    "Type 1",
    "Dual-Shift",
    "Both hands shift.",
    "create_type_dual_shift"
  ),
  Type2: letterType(
    "Type2",
    "Type 2",
    "Shift",
    "One hand shifts. The other stays in place.",
    "create_type_shift"
  ),
  Type3: letterType(
    "Type3",
    "Type 3",
    "Cross-Shift",
    "One hand shifts. The other dashes.",
    "create_type_cross_shift"
  ),
  Type4: letterType(
    "Type4",
    "Type 4",
    "Dash",
    "One hand dashes. The other stays in place.",
    "create_type_dash"
  ),
  Type5: letterType(
    "Type5",
    "Type 5",
    "Dual-Dash",
    "Both hands dash.",
    "create_type_dual_dash"
  ),
  Type6: letterType(
    "Type6",
    "Type 6",
    "Static",
    "Both hands stay in place. The props can still rotate.",
    "create_type_static"
  ),
} as const;

/**
 * The type or group name in the visitor's language: "Type 1", "Types 4-6".
 * The descriptors keep the English name as the source.
 */
export function localizedTypeName(
  descriptor: Pick<LetterTypeDescriptor | LetterTypeGroupDescriptor, "typeName">
): string {
  const range = /^Types (.+)$/.exec(descriptor.typeName)?.[1];
  if (range) return t("create_type_name_range", { range });
  const number = /^Type (.+)$/.exec(descriptor.typeName)?.[1];
  return number
    ? t("create_type_name_single", { number })
    : descriptor.typeName;
}

function joinTypeNames(names: ReadonlyArray<string>): string {
  return names.join(t("create_type_list_separator"));
}

function letterTypeGroup(
  key: LetterTypeGroupKey,
  typeName: string,
  shortLabel: string,
  memberKeys: LetterTypeKey[]
): LetterTypeGroupDescriptor {
  return {
    key,
    typeName,
    shortLabel,
    memberKeys,
  };
}

/**
 * Construct presents the six letter types in four navigation groups. This is
 * the one ordered descriptor source for headers, selector labels, and panels.
 */
export const LETTER_TYPE_GROUP_DESCRIPTORS: ReadonlyArray<LetterTypeGroupDescriptor> =
  [
    letterTypeGroup("Type1", "Type 1", "1", ["Type1"]),
    letterTypeGroup("Type2", "Type 2", "2", ["Type2"]),
    letterTypeGroup("Type3", "Type 3", "3", ["Type3"]),
    letterTypeGroup("Types 4-6", "Types 4-6", "4-6", [
      "Type4",
      "Type5",
      "Type6",
    ]),
  ];

export function getLetterTypeGroupPresentation(
  group: LetterTypeGroupDescriptor,
  resolveDescription: (descriptor: LetterTypeDescriptor) => string = (
    descriptor
  ) => descriptor.description
): LetterTypeGroupPresentation {
  const descriptions = group.memberKeys.map((memberKey) =>
    resolveDescription(LETTER_TYPE_DESCRIPTORS[memberKey])
  );
  const coloredParts = descriptions.flatMap((description, index) => [
    ...(index === 0 ? [] : [{ text: t("create_type_list_separator") }]),
    ...getColoredTextParts(description),
  ]);
  const paletteColors = [
    ...new Set(
      group.memberKeys.flatMap((memberKey) =>
        LETTER_TYPE_DESCRIPTORS[memberKey].coloredParts.flatMap((part) =>
          part.color && part.color !== "currentColor" ? [part.color] : []
        )
      )
    ),
  ];

  return {
    accessibleName: t("create_type_group_label", {
      type: localizedTypeName(group),
      names: joinTypeNames(descriptions),
    }),
    coloredParts,
    paletteColors,
  };
}

// The header joins the type name and its coloured names with the language's
// own label pattern ("Type 2: Shift", "類型 2：Shift"), keeping a space after an
// ASCII colon from breaking the line.
function joinHeader(typeHtml: string, namesHtml: string): string {
  return t("create_type_group_label", { type: typeHtml, names: namesHtml }).replace(
    /: /g,
    ":&nbsp;"
  );
}

function escapeHeaderText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatSectionTitle(
  rawTitle: string,
  resolveDescription: (descriptor: LetterTypeDescriptor) => string = (
    descriptor
  ) => descriptor.description
): string {
  // Handle grouped section - show all three types with colors
  if (rawTitle === "Types 4-6") {
    const dash = getColoredText(
      resolveDescription(LETTER_TYPE_DESCRIPTORS.Type4)
    );
    const dualDash = getColoredText(
      resolveDescription(LETTER_TYPE_DESCRIPTORS.Type5)
    );
    const staticText = getColoredText(
      resolveDescription(LETTER_TYPE_DESCRIPTORS.Type6)
    );
    const separator = t("create_type_list_separator").replace(/ /g, "&nbsp;");
    const range = localizedTypeName({ typeName: "Types 4-6" });
    return joinHeader(range, [dash, dualDash, staticText].join(separator));
  }

  // Handle individual types
  const typeInfo = getTypeDescription(rawTitle);
  if (typeInfo) {
    return joinHeader(
      escapeHeaderText(localizedTypeName(typeInfo)),
      getColoredText(resolveDescription(typeInfo))
    );
  }

  return rawTitle;
}

export function getTypeDescription(
  typeKey: string
): LetterTypeDescriptor | undefined {
  return LETTER_TYPE_DESCRIPTORS[typeKey as LetterTypeKey];
}

export function getLetterTypeGroupDescriptor(
  groupKey: string
): LetterTypeGroupDescriptor | undefined {
  return LETTER_TYPE_GROUP_DESCRIPTORS.find(
    (descriptor) => descriptor.key === groupKey
  );
}
