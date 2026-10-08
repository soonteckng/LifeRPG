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

// Choose the side with room without moving or resizing the actual app content.
// On a small screen the dialog body can scroll; its controls remain outside it.
export function tourTipPosition(rect: TourRect | null, panelHeight: number, top: number, bottom: number) {
  const gap = 14, height = Math.min(panelHeight, Math.max(0, bottom - top));
  if (!rect) return Math.max(top, bottom - height);
  const above = rect.y - gap - height, below = rect.y + rect.height + gap;
  if (below + height <= bottom && (rect.y < (top + bottom) / 2 || above < top)) return below;
  if (above >= top) return above;
  if (below + height <= bottom) return below;
  return rect.y - top > bottom - rect.y - rect.height ? top : Math.max(top, bottom - height);
}

export function tourScrollDelta(rect: TourRect, panelHeight: number, top: number, bottom: number, availableScroll = Infinity) {
  const gap = 14, room = bottom - top;
  if (rect.height + panelHeight + gap <= room) {
    // Upper sections leave the dialog below; lower sections leave it above.
    let desired = rect.y + rect.height / 2 < (top + bottom) / 2
      ? Math.max(top, Math.min(rect.y, bottom - panelHeight - gap - rect.height))
      : Math.min(bottom - rect.height, Math.max(rect.y, top + panelHeight + gap));
    // A page already at its top cannot scroll backwards to make room above.
    // Reveal the card higher and place the message below instead.
    if (desired > rect.y + availableScroll) desired = Math.max(top, Math.min(rect.y, bottom - panelHeight - gap - rect.height));
    return rect.y - desired;
  }
  if (rect.y < top) return rect.y - top;
  if (rect.y + rect.height > bottom) return rect.y + rect.height - bottom;
  return 0;
}
