export type TourRect = { x: number; y: number; width: number; height: number };
export function overlayRect(target: TourRect, overlay: TourRect): TourRect {
  // Both measurements come from measureInWindow. Subtracting the overlay's
  // origin handles Android status bars and native Modal windows consistently.
  return { ...target, x: target.x - overlay.x, y: target.y - overlay.y };
}
export function spotlightRect(target: TourRect, width: number, height: number): TourRect {
  const x = Math.max(4, Math.min(width - 4, target.x - 4)), y = Math.max(4, Math.min(height - 4, target.y - 4));
  return { x, y, width: Math.max(0, Math.min(width - 4, target.x + target.width + 4) - x), height: Math.max(0, Math.min(height - 4, target.y + target.height + 4) - y) };
}
