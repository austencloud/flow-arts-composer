import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";

export function drawSmartCellBorders(
  ctx: CanvasRenderingContext2D,
  columns: number,
  rows: number,
  stepSize: number,
  sequence: SequenceData,
  options: Partial<SequenceExportOptions>,
  titleOffset: number = 0,
  isDarkMode: boolean = false,
  horizontalOffset: number = 0
): void {
  ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.15)" : "#e0e0e0";
  ctx.lineWidth = 1;

  const occupiedCells = getOccupiedCells(sequence, options, columns);

  const isOccupied = (col: number, row: number): boolean => {
    return occupiedCells.has(`${col},${row}`);
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns - 1; col++) {
      if (isOccupied(col, row) && isOccupied(col + 1, row)) {
        const x = (col + 1) * stepSize + horizontalOffset;
        ctx.beginPath();
        ctx.moveTo(x, row * stepSize + titleOffset);
        ctx.lineTo(x, (row + 1) * stepSize + titleOffset);
        ctx.stroke();
      }
    }
  }

  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows - 1; row++) {
      if (isOccupied(col, row) && isOccupied(col, row + 1)) {
        const y = (row + 1) * stepSize + titleOffset;
        ctx.beginPath();
        ctx.moveTo(col * stepSize + horizontalOffset, y);
        ctx.lineTo((col + 1) * stepSize + horizontalOffset, y);
        ctx.stroke();
      }
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (!isOccupied(col, row)) continue;

      const x = col * stepSize + horizontalOffset;
      const y = row * stepSize + titleOffset;

      if (row === 0 || !isOccupied(col, row - 1)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + stepSize, y);
        ctx.stroke();
      }

      if (row === rows - 1 || !isOccupied(col, row + 1)) {
        ctx.beginPath();
        ctx.moveTo(x, y + stepSize);
        ctx.lineTo(x + stepSize, y + stepSize);
        ctx.stroke();
      }

      if (col === 0 || !isOccupied(col - 1, row)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + stepSize);
        ctx.stroke();
      }

      if (col === columns - 1 || !isOccupied(col + 1, row)) {
        ctx.beginPath();
        ctx.moveTo(x + stepSize, y);
        ctx.lineTo(x + stepSize, y + stepSize);
        ctx.stroke();
      }
    }
  }
}

export function getOccupiedCells(
  sequence: SequenceData,
  options: Partial<SequenceExportOptions>,
  columns: number
): Set<string> {
  const occupied = new Set<string>();

  const hasStartPlacementToRender =
    options.includeStartPlacement &&
    (sequence.startPlacement || (sequence.steps && sequence.steps.length > 0));
  if (hasStartPlacementToRender) {
    occupied.add("0,0");
  }

  const layoutMode = options.startPlacementLayout ?? "row";
  const useColumnMode = layoutMode === "column" && !!options.includeStartPlacement;
  const startRow = (!useColumnMode && options.includeStartPlacement) ? 1 : 0;
  const startColumn = useColumnMode ? 1 : 0;
  const stepsPerRow = columns - startColumn;

  for (let i = 0; i < (sequence.steps?.length || 0); i++) {
    const col = startColumn + (i % stepsPerRow);
    const row = startRow + Math.floor(i / stepsPerRow);
    occupied.add(`${col},${row}`);
  }

  return occupied;
}

export function findEmptyCellForQR(
  columns: number,
  rows: number,
  sequence: SequenceData,
  options: Partial<SequenceExportOptions>
): { col: number; row: number } | null {
  // One-count cards (a single beat + the start position) have no spare cell.
  // In row mode the heuristic below would pick { col: columns - 1, row: 0 },
  // which for columns === 1 IS the start-placement cell — the QR would paint
  // over the start. One-count cards never carry a QR, in any layout mode.
  if ((sequence.steps?.length ?? 0) <= 1) return null;

  const layoutMode = options.startPlacementLayout ?? "row";
  const useColumnMode = layoutMode === "column" && !!options.includeStartPlacement;

  if (options.includeStartPlacement && !useColumnMode) {
    return { col: columns - 1, row: 0 };
  }

  const occupiedCells = getOccupiedCells(sequence, options, columns);
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < columns; col++) {
      if (!occupiedCells.has(`${col},${row}`)) {
        return { col, row };
      }
    }
  }

  return null;
}
