// Shared measured geometry keeps the ring and countdown on one grid.
export function timerLayout(width: number, height: number, fontScale: number, compact = true) {
  const controlWidth = Math.min(286, Math.max(160, width - 48));
  const baseSize = height < 700 ? 48 : 60;
  const fontSize = Math.min((compact ? baseSize : 64) * Math.min(fontScale, 1.1), (controlWidth - 22) / 1.86);
  const rowHeight = Math.ceil(fontSize * 1.25);
  const labelHeight = Math.ceil(20 * Math.min(fontScale, 1.4));
  return { controlWidth, fontSize, rowHeight, labelHeight };
}
