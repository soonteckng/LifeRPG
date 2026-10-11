export interface AuthFieldRect { y: number; height: number }

// A keyboard or a longer error should move a form only enough to expose its
// active field. Centering a short form must not reset its current scroll.
export function authFieldScrollOffset(rect: AuthFieldRect | undefined, viewport: number, offset: number): number {
  if (!rect || viewport <= 0) return offset;
  if (rect.y < offset) return Math.max(0, rect.y - 12);
  if (rect.y + rect.height > offset + viewport - 12)
    return Math.max(0, rect.height > viewport - 24 ? rect.y - 12 : rect.y + rect.height - viewport + 12);
  return offset;
}
