export type TourRect = { x: number; y: number; width: number; height: number };
export function overlayRect(target: TourRect, overlay: TourRect): TourRect {
  // Both measurements come from measureInWindow. Subtracting the overlay's
  // origin handles Android status bars and native Modal windows consistently.
  return { ...target, x: target.x - overlay.x, y: target.y - overlay.y };
}
export function spotlightRect(target: TourRect, width: number, height: number): TourRect {
  const x = Math.max(4, target.x - 4), y = Math.max(4, target.y - 4);
  return { x, y, width: Math.max(0, Math.min(width - 4, target.x + target.width + 4) - x), height: Math.max(0, Math.min(height - 4, target.y + target.height + 4) - y) };
}
export function tourTipPosition(target: TourRect | null, panelHeight: number, viewport: { width: number; height: number; top: number; bottom: number }) {
  const width = Math.min(480, viewport.width - 40), left = (viewport.width - width) / 2;
  const min = viewport.top + 12, max = Math.max(min, viewport.height - viewport.bottom - panelHeight - 12);
  if (!target) return { left, width, top: Math.max(min, (viewport.height - panelHeight) / 2) };
  const below = target.y + target.height + 16, above = target.y - panelHeight - 16;
  const top = below <= max ? below : above >= min ? above : Math.max(min, Math.min(max, below));
  return { left, width, top };
}
