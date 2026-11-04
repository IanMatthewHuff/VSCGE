import { EngineError } from "./json";
import type { TextRange } from "./types";

export interface Position { x: number; y: number }
export const DIRECTIONS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
} as const;
export function inBounds(width: number, height: number, position: Position): boolean {
  return Number.isSafeInteger(position.x) && Number.isSafeInteger(position.y) &&
    position.x >= 0 && position.y >= 0 && position.x < width && position.y < height;
}
export function at<T>(grid: readonly (readonly T[])[], position: Position): T | undefined {
  return inBounds(grid[0]?.length ?? 0, grid.length, position) ? grid[position.y]?.[position.x] : undefined;
}
export function neighbors(position: Position): Position[] {
  return Object.values(DIRECTIONS).map(delta => ({ x: position.x + delta.x, y: position.y + delta.y }));
}
/** Cell hit ranges and text share one layout; glyphs are single ASCII characters. */
export function renderGrid(rows: readonly string[], header: readonly string[] = [], footer: readonly string[] = []) {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some(row => row.length !== width || !/^[\x20-\x7e]+$/.test(row)) ||
      [...header, ...footer].some(line => /[\r\n]/.test(line))) {
    throw new EngineError("Grid must be rectangular ASCII; headers/footers must be single lines");
  }
  return {
    text: [...header, ...rows, ...footer].join("\n"),
    range(position: Position): TextRange {
      if (!inBounds(width, rows.length, position)) throw new EngineError("Cell is outside the grid");
      return { line: header.length + position.y, start: position.x, end: position.x + 1 };
    },
  };
}
