export interface FocusSceneBand { ringBottom: number; areaBottom: number }
/** Keep the small walker entirely in the free lane below the ring and above activity details. */
export function focusWalkerGeometry(height: number, band?: FocusSceneBand | null) {
  const size = height < 720 ? 32 : 40, scale = 0.8, gap = 14;
  const fullHeight = size * 1.5, visibleHeight = fullHeight * scale;
  const fallbackTop = height * 0.70 - fullHeight / 2;
  if (band === undefined) return { size, scale, top: fallbackTop, visible: true };
  if (!band || !Number.isFinite(band.ringBottom) || !Number.isFinite(band.areaBottom)
    || band.ringBottom < 0 || band.areaBottom > height || band.areaBottom - band.ringBottom < visibleHeight + gap * 2)
    return { size, scale, top: fallbackTop, visible: false };
  const visualTop = band.ringBottom + (band.areaBottom - band.ringBottom - visibleHeight) / 2;
  return { size, scale, top: visualTop - (fullHeight - visibleHeight) / 2, visible: true };
}
