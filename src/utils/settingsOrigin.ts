import type { TourRect } from "./tourGeometry";
// This is transient presentation geometry, never persisted account state.
let origin: { rect: TourRect; capturedAt: number } | null = null;
export function rememberSettingsOrigin(rect: TourRect) {
  if ([rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0)
    origin = { rect, capturedAt: Date.now() };
}
export function readSettingsOrigin(): TourRect | null {
  return origin && Date.now() - origin.capturedAt < 10_000 ? { ...origin.rect } : null;
}
export function settingsTransform(origin: TourRect | null, frame: TourRect) {
  const center = origin ? { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 } : { x: frame.x + frame.width - 42, y: frame.y + 42 };
  // It starts at the button's own size rather than a dot, around a fixed pivot.
  const scale = origin ? Math.min(0.3, Math.max(0.06, origin.width / Math.max(1, frame.width))) : 0.06;
  return { x: center.x - frame.x, y: center.y - frame.y, scale };
}
