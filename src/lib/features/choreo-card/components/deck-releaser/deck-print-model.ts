import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { DeckReleaseCard } from "../../domain/models/DeckRelease";
import {
  getTnDElementByIconPath,
  TND_ELEMENTS,
  type TnDElement,
} from "../../domain/tnd-element";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

const ICON_UPGRADES: Record<string, string> = {
  "/images/elements/sun-v2.png": "/images/elements/sun-v4.png",
};

export interface DeckPrintOrder<TSequence extends Pick<SequenceData, "word">> {
  sequences: TSequence[];
  footers: DeckReleaseCard["footer"][];
  tndElements: (TnDElement | undefined)[];
}

export function normalizeDeckFooters(
  cards: DeckReleaseCard[]
): DeckReleaseCard["footer"][] {
  return cards.map((card) => {
    const footer = card.footer;
    const upgradedIcon = footer.iconPath
      ? ICON_UPGRADES[footer.iconPath]
      : undefined;
    return upgradedIcon ? { ...footer, iconPath: upgradedIcon } : footer;
  });
}

export function orderDeckForPrint<TSequence extends Pick<SequenceData, "word">>(
  sequences: TSequence[],
  footers: DeckReleaseCard["footer"][],
  options: { groupByElement: boolean; groupByLetter: boolean }
): DeckPrintOrder<TSequence> {
  const rawElements = footers.map(
    (footer) => getTnDElementByIconPath(footer.iconPath ?? "") ?? undefined
  );
  const elementOrder = TND_ELEMENTS.map((element) => element.element);
  const indexed = sequences.map((sequence, index) => ({
    sequence,
    footer: footers[index],
    element: rawElements[index],
    originalIndex: index,
  }));

  const letterRank = new Map<string, number>();
  if (options.groupByLetter) {
    for (const row of indexed) {
      const word = row.sequence.word ?? "";
      if (!letterRank.has(word)) letterRank.set(word, letterRank.size);
    }
  }

  const elementIndex = (element?: TnDElement) =>
    element ? elementOrder.indexOf(element.element) : 999;

  indexed.sort((left, right) => {
    if (options.groupByElement) {
      const elementDelta =
        elementIndex(left.element) - elementIndex(right.element);
      if (elementDelta !== 0) return elementDelta;
    }
    if (options.groupByLetter) {
      const letterDelta =
        (letterRank.get(left.sequence.word ?? "") ?? 0) -
        (letterRank.get(right.sequence.word ?? "") ?? 0);
      if (letterDelta !== 0) return letterDelta;
    }
    return left.originalIndex - right.originalIndex;
  });

  return {
    sequences: indexed.map((row) => row.sequence),
    footers: indexed
      .map((row) => row.footer)
      .filter((footer): footer is DeckReleaseCard["footer"] => footer != null),
    tndElements: indexed.map((row) => row.element),
  };
}

export interface DeckPrintMetadataInput {
  deckLabel: string;
  deckRefPadded: string;
  sequences: Pick<SequenceData, "word">[];
  loopType: string;
  level: number;
  period: string;
  selectedLength: number;
  turnIntensity: number;
  gridMode: string;
  propType: string;
  includeHowToRead: boolean;
}

export interface DeckPrintMetadata {
  title: string;
  subject: string;
  keywords: string[];
  deckSummary: string;
}

export function usesSerializedCardIdentity(
  cardProfile: "sequence" | "hand-path"
): boolean {
  return cardProfile === "sequence";
}

export function buildHandPathDeckPrintMetadata(input: {
  deckLabel: string;
  deckRefPadded: string;
  cardNames: string[];
  includeHowToRead: boolean;
}): DeckPrintMetadata {
  const contentCount = input.cardNames.length;
  const printedCount = contentCount + (input.includeHowToRead ? 1 : 0);
  return {
    title: `Deck ${input.deckRefPadded}: ${printedCount} cards`,
    subject:
      `${contentCount} Timing & Direction hand-path reference cards` +
      `${input.includeHowToRead ? " + How to Read insert" : ""}. ` +
      `Cards: ${input.cardNames.join(", ")}.`,
    keywords: [...input.cardNames, "hand paths", "timing and direction"],
    deckSummary: `${input.deckLabel}  ·  Hand Path References  ·  ${contentCount} cards`,
  };
}

export function buildDeckPrintMetadata(
  input: DeckPrintMetadataInput
): DeckPrintMetadata {
  const capitalize = (value: string) =>
    value ? value[0]!.toUpperCase() + value.slice(1) : value;
  const pretty = (value: string) =>
    value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const words = [
    ...new Set(
      input.sequences
        .map((sequence) => simplifyRepeatedWord(sequence.word ?? ""))
        .filter(Boolean)
    ),
  ];
  const count = input.sequences.length;
  const printedCount = count + (input.includeHowToRead ? 1 : 0);
  const turns = `${input.turnIntensity} turn${input.turnIntensity === 1 ? "" : "s"}`;
  const prop = pretty(input.propType);
  const deckSummary = [
    input.deckLabel,
    capitalize(input.loopType),
    input.period ? capitalize(input.period) : null,
    `${input.selectedLength}-step`,
    `L${input.level}`,
    turns,
    capitalize(input.gridMode),
    prop,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return {
    title: `Deck ${input.deckRefPadded}: ${printedCount} cards`,
    subject:
      `LOOP ${input.loopType} · ${input.selectedLength}-step · L${input.level}` +
      `${input.period ? ` · ${input.period}` : ""} · ${capitalize(input.gridMode)} · ${prop} · ${count} sequence cards` +
      `${input.includeHowToRead ? " + How to Read insert" : ""}.` +
      ` Words: ${words.join(", ")}`,
    keywords: words,
    deckSummary,
  };
}
