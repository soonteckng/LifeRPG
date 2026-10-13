export interface AuthFieldRect { y: number; height: number }

// Compare window coordinates, not keyboard height. Native resize may have
// already removed some or all of the occluded area on Android.
export function authKeyboardOverlap(top: number, height: number, keyboardTop: number | undefined): number {
  if (keyboardTop === undefined || !Number.isFinite(keyboardTop) || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0)
    return 0;
  return Math.min(height, Math.max(0, top + height - keyboardTop));
}

// A keyboard or a longer error should move a form only enough to expose its
// active field. Centering a short form must not reset its current scroll.
export function authFieldScrollOffset(rect: AuthFieldRect | undefined, viewport: number, offset: number): number {
  if (!rect || viewport <= 0) return offset;
  if (rect.y < offset) return Math.max(0, rect.y - 12);
  if (rect.y + rect.height > offset + viewport - 12)
    return Math.max(0, rect.height > viewport - 24 ? rect.y - 12 : rect.y + rect.height - viewport + 12);
  return offset;
}
